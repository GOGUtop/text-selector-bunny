/* Text Selector for Bunny / Vendetta.
 * This file is already a self-contained plugin expression; no bundler is needed.
 * No message is edited on Discord's servers. All selection stays on device.
 */
(function () {
    "use strict";

    var v = vendetta;
    var React = v.metro.common.React;
    var RN = v.metro.common.ReactNative;
    var findByProps = v.metro.findByProps;
    var before = v.patcher.before;
    var after = v.patcher.after;
    var Forms = v.ui.components.Forms || {};
    var FormRow = Forms.FormRow;
    var FormSection = Forms.FormSection;
    var Alert = v.ui.components.Alert;
    var actionSheet = findByProps("openLazy", "hideActionSheet");
    var alertManager = findByProps("openLazy", "close");
    var clipboard = v.metro.common.clipboard;
    var unpatches = [];
    var touched = new WeakSet();
    var active = false;
    var generation = 0;
    var pending = [];
    var ENTRY_ID = "text-selector-edit-message";

    function toast(message) {
        try { v.ui.toasts.showToast(message); } catch (_) { /* Optional */ }
    }

    function closeAlert() {
        try { if (alertManager && typeof alertManager.close === "function") alertManager.close(); } catch (_) {}
    }

    function copyAll(text) {
        try {
            if (clipboard && typeof clipboard.setString === "function") {
                clipboard.setString(text);
                toast("已复制全文");
            } else {
                toast("当前版本无法访问剪贴板");
            }
        } catch (_) { toast("复制失败"); }
        closeAlert();
    }

    function SelectorDialog(props) {
        var text = props.text;
        var panel = React.createElement(
            RN.ScrollView,
            {
                style: { maxHeight: 330, minHeight: 100 },
                contentContainerStyle: { paddingBottom: 8 },
                keyboardShouldPersistTaps: "always",
                nestedScrollEnabled: true
            },
            React.createElement(
                RN.View,
                { style: { backgroundColor: "#F4F4F5", borderRadius: 10, padding: 14 } },
                React.createElement(RN.Text, {
                    selectable: true,
                    selectionColor: "#80B7FF",
                    style: {
                        color: "#171717", fontSize: 16,
                        lineHeight: 25, includeFontPadding: false
                    }
                }, text)
            )
        );

        return React.createElement(
            Alert,
            {
                title: "编辑文字",
                confirmText: "关闭",
                onConfirm: closeAlert,
                cancelText: "复制全文",
                onCancel: function () { copyAll(text); }
            },
            React.createElement(RN.View, { style: { width: "100%", paddingVertical: 4 } },
                React.createElement(RN.Text, {
                    style: { color: "#A1A1AA", fontSize: 12, marginBottom: 12 }
                }, "长按下面的文字，拖动选区手柄，再点系统的「复制」。"),
                panel
            )
        );
    }

    function openSelector(text) {
        if (typeof text !== "string" || !text.length) return;
        if (!Alert || !RN.Text || !RN.ScrollView || !RN.View) {
            toast("当前客户端缺少文字选择界面组件");
            return;
        }
        try { if (actionSheet && actionSheet.hideActionSheet) actionSheet.hideActionSheet(); } catch (_) {}
        var id = setTimeout(function () {
            var i = pending.indexOf(id);
            if (i !== -1) pending.splice(i, 1);
            if (!active) return;
            try {
                if (v.ui.alerts && typeof v.ui.alerts.showCustomAlert === "function") {
                    v.ui.alerts.showCustomAlert(SelectorDialog, { text: text });
                } else if (alertManager && typeof alertManager.openLazy === "function") {
                    alertManager.openLazy({
                        importer: function () {
                            return Promise.resolve(function () {
                                return React.createElement(SelectorDialog, { text: text });
                            });
                        }
                    });
                } else {
                    toast("当前客户端不支持打开文字选择窗口");
                }
            } catch (_) { toast("打开文字选择窗口失败"); }
        }, 140);
        pending.push(id);
    }

    // The action sheet's message props are specific to the item that was long-pressed.
    // Never read the last message globally: doing that could open the wrong content.
    function messageText(props) {
        if (!props || typeof props !== "object") return "";
        var candidates = [
            props.message, props.targetMessage, props.originalMessage,
            props.channelMessage, props.messageRecord,
            props.context && props.context.message,
            props.message && props.message.message
        ];
        for (var i = 0; i < candidates.length; i++) {
            var message = candidates[i];
            if (message && typeof message.content === "string" && message.content.length)
                return message.content;
        }
        return "";
    }

    function isCopyRow(row) {
        if (!row || !row.props) return false;
        var raw = row.props.label || row.props.title || "";
        if (typeof raw !== "string") return false;
        return /复制文字|复制文本|copy text|copy message/i.test(raw);
    }

    function hasOurEntry(row) {
        return !!row && (String(row.key || "") === ENTRY_ID ||
            (row.props && row.props.id === ENTRY_ID));
    }

    // Locate an action group rather than tampering with reactions or message renderers.
    // Prefer placing the row right below Discord's existing Copy Text action.
    function injectReactTree(node, row, depth) {
        if (depth > 14) return { value: node, changed: false };
        if (Array.isArray(node)) {
            var copyIndex = -1;
            var rowCount = 0;
            for (var i = 0; i < node.length; i++) {
                if (hasOurEntry(node[i])) return { value: node, changed: false };
                if (isCopyRow(node[i])) copyIndex = i;
                if (node[i] && node[i].props && typeof node[i].props.onPress === "function") rowCount++;
            }
            if (copyIndex !== -1 || (rowCount >= 2 && node.some(function (e) { return e && e.type === FormRow; }))) {
                var output = node.slice();
                output.splice(copyIndex === -1 ? output.length : copyIndex + 1, 0, row);
                return { value: output, changed: true };
            }
            for (var j = 0; j < node.length; j++) {
                var nested = injectReactTree(node[j], row, depth + 1);
                if (nested.changed) {
                    var cloned = node.slice();
                    cloned[j] = nested.value;
                    return { value: cloned, changed: true };
                }
            }
            return { value: node, changed: false };
        }
        if (!React.isValidElement(node)) return { value: node, changed: false };
        var children = node.props && node.props.children;
        if (children === undefined || children === null) return { value: node, changed: false };
        var changed = injectReactTree(children, row, depth + 1);
        if (!changed.changed) return { value: node, changed: false };
        return {
            value: React.cloneElement(node, {}, changed.value),
            changed: true
        };
    }

    // Supports both a flat ContextMenu item array and grouped arrays.
    function injectContextItems(items, text) {
        if (!Array.isArray(items)) return items;
        var exists = items.some(function (g) {
            return (Array.isArray(g) ? g : [g]).some(function (x) { return x && x.id === ENTRY_ID; });
        });
        if (exists) return items;
        var item = {
            id: ENTRY_ID,
            label: "编辑文字",
            action: function () { openSelector(text); },
            onPress: function () { openSelector(text); }
        };
        function insert(group) {
            var i = group.findIndex(function (x) {
                return x && typeof x.label === "string" && /复制文字|复制文本|copy text|copy message/i.test(x.label);
            });
            var result = group.slice();
            result.splice(i < 0 ? result.length : i + 1, 0, item);
            return result;
        }
        if (items.some(Array.isArray)) {
            var idx = items.findIndex(function (g) { return Array.isArray(g) && g.length > 0; });
            if (idx < 0) return items;
            var groups = items.slice();
            groups[idx] = insert(groups[idx]);
            return groups;
        }
        return insert(items);
    }

    function patchMessageModule(promise) {
        var stamp = generation;
        Promise.resolve(promise).then(function (module) {
            if (!active || stamp !== generation || !module || typeof module.default !== "function" || touched.has(module)) return;
            var undo = after("default", module, function (args, result) {
                if (!active) return result;
                try {
                    var content = messageText(args && args[0]);
                    if (!content || !FormRow) return result;
                    var row = React.createElement(FormRow, {
                        key: ENTRY_ID,
                        id: ENTRY_ID,
                        label: "编辑文字",
                        onPress: function () { openSelector(content); }
                    });
                    return injectReactTree(result, row, 0).value;
                } catch (_) { return result; }
            });
            touched.add(module);
            unpatches.push(undo);
        }).catch(function () {});
    }

    function installMessageMenu() {
        var found = false;
        if (actionSheet && typeof actionSheet.openLazy === "function") {
            unpatches.push(before("openLazy", actionSheet, function (args) {
                var key = args && args[1];
                if (key === "MessageLongPressActionSheet" || key === "MessageActionSheet" || key === "MessageContextMenu") {
                    patchMessageModule(args[0]);
                }
            }));
            found = true;
        }
        var menuModule = findByProps("ContextMenu");
        if (menuModule && typeof menuModule.ContextMenu === "function") {
            unpatches.push(before("ContextMenu", menuModule, function (args) {
                try {
                    var props = args && args[0];
                    var text = messageText(props);
                    if (text && Array.isArray(props.items)) {
                        args[0] = Object.assign({}, props, { items: injectContextItems(props.items, text) });
                    }
                } catch (_) {}
            }));
            found = true;
        }
        if (!found) toast("未找到长按菜单接口；可在插件设置里测试文字选择窗口");
    }

    function onLoad() {
        if (active) return;
        active = true;
        generation++;
        try { installMessageMenu(); } catch (_) { toast("注入文字选择菜单失败"); }
    }

    function onUnload() {
        active = false;
        generation++;
        for (var i = 0; i < pending.length; i++) clearTimeout(pending[i]);
        pending = [];
        for (var j = unpatches.length - 1; j >= 0; j--) {
            try { unpatches[j](); } catch (_) {}
        }
        unpatches = [];
        touched = new WeakSet();
    }

    function settings() {
        if (!FormRow || !FormSection) {
            return React.createElement(RN.Text, {}, "文字选择：长按消息，点击「编辑文字」。");
        }
        return React.createElement(RN.ScrollView, { style: { flex: 1 } },
            React.createElement(FormSection, { title: "文字自由选择" },
                React.createElement(FormRow, {
                    label: "使用方法",
                    subLabel: "长按文字消息 → 编辑文字 → 长按选取片段 → 复制"
                }),
                React.createElement(FormRow, {
                    label: "测试文字选择窗口",
                    onPress: function () {
                        openSelector("这是一条测试消息。你可以长按任意汉字，然后拖动选择手柄，只复制需要的部分。\nThis is an English example too.");
                    }
                }),
                React.createElement(FormRow, {
                    label: "说明",
                    subLabel: "只复制本地文字，不修改 Discord 上的消息。"
                })
            )
        );
    }

    return { onLoad: onLoad, onUnload: onUnload, settings: settings };
})()
