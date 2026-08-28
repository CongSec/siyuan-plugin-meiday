import {Plugin, Dialog} from "siyuan";
import "./index.css";
import appHtml from "./assets/app.html";

/**
 * MeiDay 思源插件：
 * 顶部图标 -> Dialog 弹窗 -> iframe(blob URL) 加载单文件构建的 MeiDay 前端，
 * 前端通过 https://task.congsec.cn 调用远端 FastAPI 后端。
 *
 * 注意：addIcons 接收的是裸 <symbol>（思源会把它插进 <svg><defs> 内），
 * 不能在外面包 <svg>，否则符号注册失败、顶栏图标不显示。
 */
export default class MeiDayPlugin extends Plugin {
    private dialog: Dialog | null = null;
    private objectUrl: string | null = null;

    async onload() {
        console.log(`[${this.name}] MeiDay plugin loaded`);
        try {
            // 注册自定义顶栏图标（Feather 风格 check-square，代表"任务清单"）
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
            this.addTopBar({
                icon: "iconMeiDay",
                title: (this.i18n as Record<string, string>).openMeiDay ?? "MeiDay",
                position: "right",
                callback: () => {
                    this.openDialog();
                },
            });
        } catch (e) {
            console.error(`[${this.name}] addTopBar failed`, e);
        }
    }

    private openDialog() {
        // 已打开且仍在文档中则复用；否则重建（关闭后 element 会被移除）
        if (this.dialog) {
            if (this.dialog.element && document.body.contains(this.dialog.element)) {
                return;
            }
            this.dialog = null;
        }
        if (!this.objectUrl) {
            const blob = new Blob([appHtml], {type: "text/html;charset=utf-8"});
            this.objectUrl = URL.createObjectURL(blob);
        }
        const dialog = new Dialog({
            title: "MeiDay",
            content: `<div class="meiday__wrap"><iframe class="meiday__iframe" src="${this.objectUrl}"></iframe></div>`,
            width: "940px",
            height: "72vh",
        });
        this.dialog = dialog;
    }

    async onunload() {
        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
            this.objectUrl = null;
        }
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
