import {Plugin} from "siyuan";
import "./index.css";
import appHtml from "./assets/app.html";

/**
 * ===== 侧边栏配置 =====
 * 插件改为「右侧边栏停靠面板」(addDock)，不再使用顶部按钮 + 弹窗。
 * 改这里即可调整：
 *  - DOCK_POSITION : 停靠位置
 *      "RightTop"    右上侧栏（默认，点右侧栏图标展开 MeiDay 面板）
 *      "RightBottom" 右下侧栏
 *      "LeftTop"     左上侧栏
 *      "LeftBottom"  左下侧栏
 *      "BottomLeft"  / "BottomRight"  底部左右
 *  - DOCK_WIDTH    : 面板宽度(px)，想更宽/更窄改这个数字
 *  - DOCK_SHOW     : true = 启动思源后自动展开面板；false = 需要点右侧栏的图标才展开
 *
 * 注意：思源对侧边栏宽度也有视觉上限，太宽会自动压窄，属正常现象。
 */
const DOCK_POSITION: "RightTop" | "RightBottom" | "LeftTop" | "LeftBottom" | "BottomLeft" | "BottomRight" = "RightTop";
const DOCK_WIDTH = 420;
const DOCK_SHOW = false;

/**
 * 如果想改回「顶部图标 + 弹窗」的方式，把下方 openDialog() 的注释去掉，
 * 并把 onLayoutReady() 里换成 addTopBar(...)（见文件末尾注释示例）。
 */
// const DIALOG_WIDTH  = "940px";
// const DIALOG_HEIGHT = "72vh";

/**
 * MeiDay 思源插件：
 * 右侧边栏停靠面板 -> iframe(blob URL) 加载单文件构建的 MeiDay 前端，
 * 前端通过 https://task.congsec.cn 调用远端 FastAPI 后端。
 *
 * 注意：addIcons 接收的是裸 <symbol>（思源会把它插进 <svg><defs> 内），
 * 不能在外面包 <svg>，否则符号注册失败、侧栏图标不显示。
 */
export default class MeiDayPlugin extends Plugin {
    private objectUrl: string | null = null;

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
            // 注册自定义侧栏图标（Feather 风格 check-square，代表"任务清单"）
            this.addIcons(`<symbol id="iconMeiDay" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/>
                <path d="M9 11l3 3L22 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </symbol>`);
        } catch (e) {
            console.error(`[${this.name}] register icon failed`, e);
        }
    }

    async onLayoutReady() {
        try {
            // 提前建好 blob URL，供 init 闭包复用（init 每次面板展开都会执行，不能重复建 URL）
            const objectUrl = this.ensureObjectUrl();
            this.addDock({
                config: {
                    position: DOCK_POSITION,
                    size: {width: DOCK_WIDTH, height: 0},
                    icon: "iconMeiDay",
                    title: (this.i18n as Record<string, string>).openMeiDay ?? "MeiDay",
                    show: DOCK_SHOW,
                    index: 1,
                },
                data: {},
                type: "meiday",
                init() {
                    this.element.classList.add("meiday__wrap");
                    this.element.innerHTML = `<iframe class="meiday__iframe" src="${objectUrl}"></iframe>`;
                },
                destroy() {},
            });
        } catch (e) {
            console.error(`[${this.name}] addDock failed`, e);
        }
    }

    async onunload() {
        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
            this.objectUrl = null;
        }
    }

    /*
     * 【可选】想改回顶部图标 + 弹窗时，恢复下面的 openDialog()，
     * 并把 onLayoutReady() 替换为：
     *
     *   this.addTopBar({
     *       icon: "iconMeiDay",
     *       title: (this.i18n as Record<string, string>).openMeiDay ?? "MeiDay",
     *       position: "right",
     *       callback: () => this.openDialog(),
     *   });
     *
    private dialog: Dialog | null = null;
    private openDialog() {
        if (this.dialog) {
            if (this.dialog.element && document.body.contains(this.dialog.element)) {
                return;
            }
            this.dialog = null;
        }
        const objectUrl = this.ensureObjectUrl();
        const dialog = new Dialog({
            title: "MeiDay",
            content: `<div class="meiday__wrap"><iframe class="meiday__iframe" src="${objectUrl}"></iframe></div>`,
            width: DIALOG_WIDTH,
            height: DIALOG_HEIGHT,
        });
        this.dialog = dialog;
    }
    */
}