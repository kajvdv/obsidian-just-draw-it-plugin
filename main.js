"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const language_1 = require("@codemirror/language");
const obsidian_1 = require("obsidian");
const state_1 = require("@codemirror/state");
const view_1 = require("@codemirror/view");
const view_2 = require("@codemirror/view");
const state_2 = require("@codemirror/state");
// function getRange(node: SyntaxNode)
let app = null;
class CanvasWidget extends view_1.WidgetType {
    constructor() {
        super(...arguments);
        this.canvas = null;
    }
    toDOM(view) {
        this.canvas = document.createElement("canvas");
        const canvas = this.canvas;
        const ctx = canvas.getContext("2d");
        if (!ctx)
            throw new Error("Could not get context");
        const canvasRect = canvas.getBoundingClientRect();
        canvas.style.width = '100%';
        canvas.width = 700; // This is the width of the notes
        ctx.scale(canvas.width / canvasRect.width, canvas.height / canvasRect.height);
        ctx.fillStyle = 'red';
        ctx.fillRect(10, 10, 100, 100);
        canvas.addEventListener('mousemove', ev => {
            ctx.fillRect(ev.offsetX, ev.offsetY, 2, 2);
        });
        canvas.addEventListener('click', (ev) => __awaiter(this, void 0, void 0, function* () {
            if (app == null)
                return;
            const buffer = yield new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    if (blob === null)
                        throw new Error("Blob was null");
                    blob.arrayBuffer().then(buffer => resolve(buffer));
                }, 'image/png');
            });
            const filePath = 'testfile.png';
            const files = app.vault.getFiles();
            let pngFile = null;
            for (let file of files)
                if (filePath === file.path) {
                    pngFile = file;
                    console.log("found file", file.path);
                    break;
                }
            if (pngFile !== null) {
                app.vault.modifyBinary(pngFile, buffer);
            }
            else {
                app.vault.createBinary(filePath, buffer);
            }
        }));
        return canvas;
    }
    get estimatedHeight() {
        var _a;
        return ((_a = this.canvas) === null || _a === void 0 ? void 0 : _a.height) || 0;
    }
}
const canvasDecoration = view_2.Decoration.replace({
    widget: new CanvasWidget(),
    block: true,
});
const canvasField = state_1.StateField.define({
    create() {
        const set = view_2.Decoration.none;
        return set;
    },
    update(canvasDecs, tr) {
        const builder = new state_2.RangeSetBuilder();
        (0, language_1.syntaxTree)(tr.state).iterate({
            enter(node) {
                if (node.type.name == "hmd-barelink_link") {
                    const text = tr.state.doc.sliceString(node.from, node.to);
                    if (text == "canvas") {
                        const range = canvasDecoration.range(node.from - 1, node.to + 1);
                        builder.add(range.from, range.to, range.value);
                    }
                }
            }
        });
        return builder.finish();
    },
    provide(field) {
        return view_1.EditorView.decorations.from(field);
    },
});
class ExamplePlugin extends obsidian_1.Plugin {
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            this.registerEditorExtension(canvasField);
            app = this.app;
            this.registerMarkdownPostProcessor((element, context) => {
                // Replace all canvas tags with images
            });
        });
    }
}
exports.default = ExamplePlugin;
