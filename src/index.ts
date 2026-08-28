import {Plugin, Dialog} from "siyuan";
import "./index.css";
import appHtml from "./assets/app.html";

/**
 * MeiDay 思源插件：
 * 顶部图标 -> Dialog 弹窗 -> iframe(blob URL) 加载单文件构建的 MeiDay 前端，
 * 前端通过 https://task.congsec.cn 调用远端 FastAPI 后端。
 */
export default class MeiDayPlugin extends Plugin {
    private dialog: Dialog | null = null;
    private objectUrl: string | null = null;

    async onload() {
        console.log(`[${this.name}] MeiDay plugin loaded`);
    }

    async onLayoutReady() {
        this.addTopBar({
            icon: "iconMeiDay",
            title: (this.i18n as Record<string, string>).openMeiDay ?? "MeiDay",
            position: "right",
            callback: () => {
                this.openDialog();
            },
        });
    }

    private openDialog() {
        // 已打开则直接复用，避免重复弹窗
        if (this.dialog && this.dialog.element && document.body.contains(this.dialog.element)) {
            return;
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
            this.dialog.destroy();
            this.dialog = null;
        }
    }
}
