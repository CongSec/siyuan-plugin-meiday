import {Plugin} from "siyuan";
import "./index.css";
import appHtml from "./assets/app.html";

/**
 * ===== 弹窗尺寸配置 =====
 * 改这里即可调整 MeiDay 弹窗的大小：
 *  - DIALOG_WIDTH  : 宽度，CSS 长度，如 "940px" / "80vw"
 *  - DIALOG_HEIGHT : 高度，CSS 长度，如 "72vh" / "600px"
 */
const DIALOG_WIDTH = "84vw";
const DIALOG_HEIGHT = "72vh";

/**
 * MeiDay 思源插件：
 * 右侧边栏（#dockRight 的图标栏）放一个 MeiDay 图标，点击后以【全屏遮罩 + 面板 + iframe】
 * 方式打开 MeiDay 前端（iframe 用 srcdoc 内联 app.html），前端通过 https://task.congsec.cn
 * 调用远端 FastAPI 后端。
 *
 * ===== 为什么改用 srcdoc（本版本核心修复）=====
 * 旧版本用 blob URL 作为 iframe 的 src：blob iframe 属于「不透明源」，localStorage / IndexedDB
 * 只是临时的，思源完全重启后全部丢失 → 退出登录、无数据缓存。
 * 改用 srcdoc 内联后，iframe 与思源【同源】：localStorage（登录 token / 记住的密码）和
 * IndexedDB（meiday 数据缓存）落到思源真实源，思源完全重启后登录态与缓存都能保留。
 *
 * ===== 登录态双保险（plugin.storage 镜像）=====
 * 万一思源端口变化（6806 被占用时换端口）或 localStorage 被清，iframe 里 localStorage 会丢失。
 * 因此插件把登录态（token / 记住的密码 / 用户名）镜像保存到插件数据目录（plugin.storage，
 * 磁盘文件），并在父窗口挂 __meiday_restore 全局；前端 main.ts 启动时若 localStorage 为空，
 * 会从该全局恢复。端口变化 / 存储被清后依然保持登录。
 *
 * 缓存说明：iframe 只创建一次（srcdoc），关闭弹窗只隐藏、不销毁，再次打开秒开且状态不丢。
 */
export default class MeiDayPlugin extends Plugin {
    private overlay: HTMLElement | null = null;
    private iframe: HTMLIFrameElement | null = null;
    private railObserver: MutationObserver | null = null;
    private injectTimer: ReturnType<typeof setTimeout> | null = null;
    /** 登录态镜像（来自 iframe localStorage），同时落在 plugin.storage 与父窗口全局 */
    private sessionMirror: SessionMirror | null = null;
    private storageReady = false;
    /** persistSessionMirror 的防抖定时器 */
    private persistTimer: ReturnType<typeof setTimeout> | null = null;

    async onload() {
        console.log(`[${this.name}] MeiDay plugin loaded`);
        try {
            // 注册自定义图标（Feather 风格 check-square，代表"任务清单"）
            this.addIcons(`<symbol id="iconMeiDay" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/>
                <path d="M9 11l3 3L22 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </symbol>`);
        } catch (e) {
            console.error(`[${this.name}] register icon failed`, e);
        }
        // 读取上次保存在插件数据目录的登录态（端口变化 / localStorage 被清时的恢复源）
        await this.loadStoredSession();
        this.refreshParentRestoreGlobal();
        // 监听 iframe（同源）对 localStorage 的写入：登录/登出/记住密码变化实时镜像到 plugin.storage
        window.addEventListener("storage", this.onLocalStorageChange);
    }

    async onLayoutReady() {
        this.ensureDockIcon();
        this.watchDockRail();
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
                void this.openDialog();
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

    /** 打开 MeiDay 弹窗：只创建一次遮罩/iframe，之后仅切换显隐（秒开、状态不丢） */
    private async openDialog(): Promise<void> {
        // 打开前确保把最新登录态挂到父窗口全局（srcdoc iframe 的 main.ts 会读取它做双保险恢复）
        await this.ensureStoredSession();
        const overlay = this.ensureOverlay();
        if (!document.body.contains(overlay)) {
            document.body.append(overlay);
        }
        overlay.classList.add("meiday-overlay--open");
    }

    /** 隐藏弹窗（不销毁 iframe，保留内存数据缓存） */
    private hideDialog(): void {
        if (this.overlay) {
            this.overlay.classList.remove("meiday-overlay--open");
        }
    }

    /** 构建或复用遮罩层：iframe 只创建一次，之后即使被从 DOM 移除也只重新挂载、不重建 */
    private ensureOverlay(): HTMLElement {
        if (this.overlay) {
            return this.overlay;
        }
        const overlay = document.createElement("div");
        overlay.className = "meiday-overlay";
        overlay.innerHTML = `
            <div class="meiday-overlay__scrim"></div>
            <div class="meiday-overlay__panel" style="width:${DIALOG_WIDTH};height:${DIALOG_HEIGHT};">
                <button class="meiday-overlay__close" type="button" aria-label="关闭 MeiDay" title="关闭 MeiDay">
                    <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
                </button>
            </div>`;

        // srcdoc 内联：iframe 与思源同源 → localStorage/IndexedDB 落到思源真实源，重启保留
        const iframe = document.createElement("iframe");
        iframe.className = "meiday-overlay__iframe";
        iframe.setAttribute("title", "MeiDay");
        iframe.setAttribute("allow", "clipboard-write");
        iframe.srcdoc = appHtml;
        iframe.addEventListener("load", () => this.syncFromIframe());
        overlay.querySelector(".meiday-overlay__panel")!.appendChild(iframe);
        this.iframe = iframe;

        overlay.querySelector(".meiday-overlay__scrim")!.addEventListener("click", (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            this.hideDialog();
        });
        overlay.querySelector(".meiday-overlay__close")!.addEventListener("click", (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            this.hideDialog();
        });
        overlay.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                this.hideDialog();
            }
        });
        this.overlay = overlay;
        return overlay;
    }

    /** ---- 登录态双保险：plugin.storage 镜像 ---- */

    /** iframe（同源）写入 localStorage 时，实时把登录态镜像到 plugin.storage */
    private onLocalStorageChange = (): void => {
        this.syncFromIframe();
    };

    /** 读取 iframe 的 localStorage，更新内存镜像 + 父窗口全局 + plugin.storage */
    private syncFromIframe(): void {
        const iframe = this.iframe;
        if (!iframe || !iframe.contentWindow) {
            return;
        }
        try {
            const ls = iframe.contentWindow.localStorage;
            const token = ls.getItem(LS_TOKEN) || "";
            const tokenAt = Number(ls.getItem(LS_TOKEN_AT) || 0) || 0;
            const savedPw = ls.getItem(LS_SAVED_PW) || "";
            const savedPwAt = Number(ls.getItem(LS_SAVED_PW_AT) || 0) || 0;
            const username = ls.getItem(LS_USER) || "";
            if (!token && !savedPw && !username) {
                this.sessionMirror = null;
            } else {
                this.sessionMirror = {
                    token: token || undefined,
                    tokenAt: tokenAt || undefined,
                    savedPw: savedPw || undefined,
                    savedPwAt: savedPwAt || undefined,
                    username: username || undefined,
                };
            }
            this.refreshParentRestoreGlobal();
            this.persistSessionMirror();
        } catch (e) {
            console.error(`[${this.name}] syncFromIframe failed`, e);
        }
    }

    /** 把登录态镜像挂到父窗口全局，供 srcdoc iframe 的 main.ts 在启动时恢复 */
    private refreshParentRestoreGlobal(): void {
        try {
            (window as unknown as { __meiday_restore: SessionMirror | null }).__meiday_restore = this.sessionMirror;
        } catch (e) {
            console.error(`[${this.name}] set __meiday_restore failed`, e);
        }
    }

    /** 防抖写入 plugin.storage（磁盘），避免频繁 storage 事件反复写文件 */
    private persistSessionMirror(): void {
        if (this.persistTimer) {
            clearTimeout(this.persistTimer);
        }
        this.persistTimer = setTimeout(() => {
            this.persistTimer = null;
            if (!this.storageReady) {
                return;
            }
            try {
                void this.saveData(SESSION_STORAGE_KEY, this.sessionMirror);
            } catch (e) {
                console.error(`[${this.name}] saveData session failed`, e);
            }
        }, 300);
    }

    /** 从插件数据目录读取登录态镜像（onload / 每次打开前兜底） */
    private async loadStoredSession(): Promise<void> {
        try {
            const saved = await this.loadData(SESSION_STORAGE_KEY);
            if (saved && typeof saved === "object") {
                this.sessionMirror = saved as SessionMirror;
            }
        } catch (e) {
            console.error(`[${this.name}] loadData session failed`, e);
        }
        this.storageReady = true;
    }

    /** 打开前兜底：确保镜像已加载，并把最新登录态挂到父窗口全局 */
    private async ensureStoredSession(): Promise<void> {
        if (!this.storageReady) {
            await this.loadStoredSession();
        }
        this.refreshParentRestoreGlobal();
    }

    async onunload() {
        if (this.railObserver) {
            this.railObserver.disconnect();
            this.railObserver = null;
        }
        if (this.injectTimer) {
            clearTimeout(this.injectTimer);
            this.injectTimer = null;
        }
        if (this.persistTimer) {
            clearTimeout(this.persistTimer);
            this.persistTimer = null;
        }
        window.removeEventListener("storage", this.onLocalStorageChange);
        const item = document.querySelector<HTMLElement>('#dockRight .dock__items [data-plugin-meiday]');
        if (item) {
            item.remove();
        }
        // 卸载插件时彻底销毁遮罩与 iframe
        if (this.overlay) {
            try {
                this.overlay.remove();
            } catch (e) {
                console.error(`[${this.name}] remove overlay failed`, e);
            }
            this.overlay = null;
            this.iframe = null;
        }
        // 清理父窗口全局，避免残留影响下次加载
        try {
            (window as unknown as { __meiday_restore?: unknown }).__meiday_restore = undefined;
        } catch (e) {
            /* ignore */
        }
    }
}

/** 登录态镜像结构（与前端 client.ts 里的 st_* 键对应） */
interface SessionMirror {
    token?: string;
    tokenAt?: number;
    savedPw?: string;
    savedPwAt?: number;
    username?: string;
}

const SESSION_STORAGE_KEY = "meiday-session.json";
const LS_TOKEN = "st_token";
const LS_TOKEN_AT = "st_token_at";
const LS_SAVED_PW = "st_saved_pw";
const LS_SAVED_PW_AT = "st_saved_pw_at";
const LS_USER = "st_user";
