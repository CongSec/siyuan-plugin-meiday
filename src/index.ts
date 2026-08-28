import {Plugin, Dialog} from "siyuan";
import "./index.css";
import appHtml from "./assets/app.html";

/**
 * ===== 弹窗尺寸配置 =====
 * 改这里即可调整 MeiDay 弹窗的大小：
 *  - DIALOG_WIDTH  : 宽度，CSS 长度，如 "940px" / "80vw"
 *  - DIALOG_HEIGHT : 高度，CSS 长度，如 "72vh" / "600px"
 * 注意：思源会把弹窗限制在视口宽度的 88% 以内（max-width: 88vw），
 *       设太宽在窄屏上会被自动收窄，属正常现象。
 */
const DIALOG_WIDTH = "84vw";
const DIALOG_HEIGHT = "72vh";

/**
 * MeiDay 思源插件：
 * 右侧边栏（#dockRight 的图标栏）放一个 MeiDay 图标，
 * 点击后以【弹窗(Dialog)】方式打开 MeiDay 前端（iframe + blob URL），
 * 前端通过 https://task.congsec.cn 调用远端 FastAPI 后端。
 *
 * 说明：思源的右侧边栏图标点击会默认展开「停靠面板」；这里改为只放一个图标，
 *       点击直接弹窗，不占右侧栏空间（符合“图标在侧栏、打开是弹窗”的诉求）。
 *       如果以后想换成「侧边栏停靠面板」，改回 addDock 方案即可（见 README）。
 *
 * 缓存说明：iframe 常驻（关闭弹窗只隐藏、不销毁），从 OSS 拉下来的数据
 *       会一直留在内存里，再次打开是秒开，不再重新加载。
 */
export default class MeiDayPlugin extends Plugin {
    private dialog: Dialog | null = null;
    private objectUrl: string | null = null;
    private railObserver: MutationObserver | null = null;
    private injectTimer: ReturnType<typeof setTimeout> | null = null;

    /** 首次调用时把内联的 app.html 包成 blob URL，之后复用同一个 */
    private ensureObjectUrl(): string {
        if (!this.objectUrl) {
            const blob = new Blob([appHtml], {type: "text/html;charset=utf-8"});
            this.objectUrl = URL.createObjectURL(blob);
        }
        return this.objectUrl;
    }

    async onload() {
        console.log(`[${this.name}] MeiDay plugin loaded`);
        try {
            // 注册自定义图标（Feather 风格 check-square，代表"任务清单"）
            // 注意：addIcons 必须传裸 <symbol>（思源会插进 <svg><defs> 内），不能包 <svg>
            this.addIcons(`<symbol id="iconMeiDay" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/>
                <path d="M9 11l3 3L22 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </symbol>`);
        } catch (e) {
            console.error(`[${this.name}] register icon failed`, e);
        }
    }

    async onLayoutReady() {
        // 把 MeiDay 图标注入右侧边栏的图标栏
        this.ensureDockIcon();
        this.watchDockRail();
        // 兜底：若布局尚未渲染出右侧栏，稍后再试
        this.injectTimer = setTimeout(() => this.ensureDockIcon(), 1000);
    }

    /** 若右侧栏图标栏没有 MeiDay 图标，则插入一个（点击=弹窗） */
    private ensureDockIcon(): void {
        try {
            const rail = document.querySelector<HTMLElement>("#dockRight .dock__items");
            if (!rail) {
                return; // 布局还没渲染出来，等兜底定时器/观察者再触发
            }
            if (rail.querySelector('[data-plugin-meiday]')) {
                return; // 已存在，不重复插入
            }
            const item = document.createElement("span");
            item.setAttribute("data-plugin-meiday", "");
            item.className = "dock__item ariaLabel";
            item.title = "MeiDay";
            item.setAttribute("aria-label", "MeiDay");
            item.innerHTML = `<svg><use xlink:href="#iconMeiDay"></use></svg>`;
            item.addEventListener("click", (e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                this.openDialog();
            });
            rail.appendChild(item);
        } catch (e) {
            console.error(`[${this.name}] inject dock icon failed`, e);
        }
    }

    /** 监听右侧栏图标栏，思源重新渲染时自动把我们的图标补回去 */
    private watchDockRail(): void {
        try {
            const rail = document.querySelector<HTMLElement>("#dockRight .dock__items");
            if (!rail || this.railObserver) {
                return;
            }
            this.railObserver = new MutationObserver(() => this.ensureDockIcon());
            this.railObserver.observe(rail, {childList: true, subtree: true});
        } catch (e) {
            console.error(`[${this.name}] watch dock rail failed`, e);
        }
    }

    /**
     * 打开 MeiDay 弹窗。
     * 缓存策略：iframe 只在第一次创建，之后关闭弹窗只是隐藏（hideDialog），
     * 再次打开直接显示（showDialog），iframe 内的 OSS 数据全部保留、秒开。
     */
    private openDialog() {
        // 弹窗若已存在且仍在文档中 -> 直接显示，不重建 iframe
        if (this.dialog && this.dialog.element && document.body.contains(this.dialog.element)) {
            this.showDialog();
            return;
        }
        // 弹窗不存在或已被外部销毁 -> 重建（blob URL 复用，不重复打包）
        this.dialog = null;
        const objectUrl = this.ensureObjectUrl();
        const dialog = new Dialog({
            title: "MeiDay",
            content: `<div class="meiday__wrap"><iframe class="meiday__iframe" src="${objectUrl}"></iframe></div>`,
            width: DIALOG_WIDTH,
            height: DIALOG_HEIGHT,
            disableClose: true, // 阻止思源默认的「销毁」式关闭，让 iframe 常驻缓存
        });
        // 接管右上角关闭按钮与遮罩：都改为「隐藏弹窗」而非销毁，从而保留 iframe 内的数据缓存
        try {
            // 1) 右上角 X：disableClose 会隐藏它，这里恢复显示并绑定「隐藏」
            const close = dialog.element.querySelector<HTMLElement>(".b3-dialog__close");
            if (close) {
                close.classList.remove("fn__none");
                const newClose = close.cloneNode(true) as HTMLElement; // 克隆以丢弃原关闭事件
                const parent = close.parentNode;
                if (parent) {
                    parent.replaceChild(newClose, close);
                }
                newClose.addEventListener("click", (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.hideDialog();
                });
            }
            // 2) 遮罩：点击同样「隐藏」而非销毁
            const scrim = dialog.element.querySelector<HTMLElement>(".b3-dialog__scrim");
            if (scrim) {
                scrim.addEventListener("click", (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.hideDialog();
                });
            }
        } catch (e) {
            console.error(`[${this.name}] override close button failed`, e);
        }
        this.dialog = dialog;
    }

    /** 显示弹窗（复用常驻 iframe，秒开） */
    private showDialog(): void {
        const dlg = this.dialog;
        if (!dlg || !dlg.element) {
            return;
        }
        document.body.append(dlg.element); // 移到 body 末尾，确保显示在最上层
        dlg.element.style.display = "";
        dlg.element.classList.add("b3-dialog--open");
    }

    /** 隐藏弹窗（不销毁 iframe，保留 OSS 数据缓存） */
    private hideDialog(): void {
        const dlg = this.dialog;
        if (!dlg || !dlg.element) {
            return;
        }
        dlg.element.classList.remove("b3-dialog--open");
        dlg.element.style.display = "none";
    }

    async onunload() {
        // 清理观察者与注入的图标
        if (this.railObserver) {
            this.railObserver.disconnect();
            this.railObserver = null;
        }
        if (this.injectTimer) {
            clearTimeout(this.injectTimer);
            this.injectTimer = null;
        }
        const item = document.querySelector<HTMLElement>('#dockRight .dock__items [data-plugin-meiday]');
        if (item) {
            item.remove();
        }
        // 释放 blob URL
        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
            this.objectUrl = null;
        }
        // 真正销毁弹窗（插件卸载时释放 iframe）
        if (this.dialog) {
            try {
                this.dialog.destroy();
            } catch (e) {
                console.error(`[${this.name}] destroy dialog failed`, e);
            }
            this.dialog = null;
        }
    }
}