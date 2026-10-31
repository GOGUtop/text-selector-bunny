(function () {
    "use strict";

    // Never perform fragile module lookups while evaluating the plugin. If one
    // of them throws, classic Vendetta/Revenge discards the entire plugin object
    // and greys out the settings wrench.
    var v = typeof vendetta !== "undefined" ? vendetta :
        (typeof bunny !== "undefined" ? bunny : null);
    var React = null, RN = null, findByProps = null, before = null, after = null;
    var Forms = {}, FormRow = null, FormSection = null, Alert = null;
    var actionSheet = null, alertManager = null, clipboard = null;
    var bootError = "尚未启动";
    var bootSuccess = false;
    function getSafe(findFn, names) {
        try { return typeof findFn === "function" ? findFn.apply(null, names) : null; }
        catch (e) { return null; }
    }
    function setupRuntime() {
        if (!v || !v.metro || !v.patcher || !v.ui) throw Error("没有找到 Vendetta/Bunny 兼容接口");
        var common = v.metro.common || {};
        React = common.React;
        RN = common.ReactNative;
        findByProps = v.metro.findByProps;
        before = v.patcher.before;
        after = v.patcher.after;
        Forms = (v.ui.components && v.ui.components.Forms) || {};
        FormRow = Forms.FormRow;
        FormSection = Forms.FormSection;
        Alert = v.ui.components && v.ui.components.Alert;
        clipboard = common.clipboard;
        actionSheet = getSafe(findByProps, ["openLazy", "hideActionSheet"]);
        alertManager = getSafe(findByProps, ["openLazy", "close"]);
        if (!React || !RN || typeof before !== "function" || typeof after !== "function")
            throw Error("React/ReactNative/patcher 接口缺失");
    }
    var unpatches = [];
    var touched = new WeakSet();
    var diagnostics = {
        foundDirect: 0, foundLazy: 0, menuOpened: 0,
        inserted: 0, noMessage: 0, noSection: 0,
        last: "插件已启动，等待长按文字消息"
    };
    var active = false;
    var generation = 0;
    var pending = [];
    var ENTRY_ID = "text-selector-edit-message";

    function toast(message) {
        try { if (v && v.ui && v.ui.toasts) v.ui.toasts.showToast(message); } catch (_) { /* Optional */ }
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
    function elementContainsAction(node, depth) {
        if (depth > 12 || node == null) return false;
        if (Array.isArray(node)) {
            for (var i = 0; i < node.length; i++) {
                if (elementContainsAction(node[i], depth + 1)) return true;
            }
            return false;
        }
        if (!React.isValidElement(node)) return false;
        var p = node.props || {};
        if (node.type === FormRow && (typeof p.onPress === "function" || p.label != null)) return true;
        return elementContainsAction(p.children, depth + 1);
    }

    function elementContainsEntry(node, depth) {
        if (depth > 12 || node == null) return false;
        if (Array.isArray(node)) {
            for (var i = 0; i < node.length; i++) if (elementContainsEntry(node[i], depth + 1)) return true;
            return false;
        }
        if (!React.isValidElement(node)) return false;
        return hasOurEntry(node) || elementContainsEntry(node.props && node.props.children, depth + 1);
    }

    // Some Discord builds use keyed ActionSection components instead of a flat
    // FormRow list. Vendetta's own quick-install feature patches these sections.
    function injectActionSection(node, row, depth) {
        if (depth > 18 || node == null) return { value: node, changed: false };
        if (Array.isArray(node)) {
            if (node.length > 0 && node.every(function (entry) {
                return React.isValidElement(entry) && entry.key != null;
            }) && node.some(function (entry) { return elementContainsAction(entry, 0); })) {
                if (elementContainsEntry(node, 0)) return { value: node, changed: false };
                var sectionIndex = node.findIndex(function (entry) { return elementContainsAction(entry, 0); });
                var SectionType = node[sectionIndex].type;
                var group = React.createElement(SectionType, { key: ENTRY_ID }, row);
                var sections = node.slice();
                sections.splice(sectionIndex + 1, 0, group);
                return { value: sections, changed: true };
            }
            for (var i = 0; i < node.length; i++) {
                var nested = injectActionSection(node[i], row, depth + 1);
                if (nested.changed) {
                    var copy = node.slice();
                    copy[i] = nested.value;
                    return { value: copy, changed: true };
                }
            }
            return { value: node, changed: false };
        }
        if (!React.isValidElement(node)) return { value: node, changed: false };
        var children = node.props && node.props.children;
        if (children == null) return { value: node, changed: false };
        var changed = injectActionSection(children, row, depth + 1);
        if (!changed.changed) return { value: node, changed: false };
        return { value: React.cloneElement(node, {}, changed.value), changed: true };
    }

    function injectReactTree(node, row, depth) {
        if (depth > 18) return { value: node, changed: false };
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

    function addToMenuTree(result, props, origin) {
        if (!active) return result;
        diagnostics.menuOpened++;
        try {
            var content = messageText(props);
            if (!content) {
                diagnostics.noMessage++;
                diagnostics.last = "捕获到菜单，但未读取到 message.content";
                return result;
            }
            if (!FormRow) {
                diagnostics.last = "客户端缺少 FormRow 组件";
                return result;
            }
            var row = React.createElement(FormRow, {
                key: ENTRY_ID, id: ENTRY_ID, label: "编辑文字",
                onPress: function () { openSelector(content); }
            });
            if (elementContainsEntry(result, 0)) return result;
            var change = injectReactTree(result, row, 0);
            if (!change.changed) change = injectActionSection(result, row, 0);
            if (change.changed) {
                diagnostics.inserted++;
                diagnostics.last = "已向消息菜单添加编辑文字（" + origin + "）";
                return change.value;
            }
            diagnostics.noSection++;
            diagnostics.last = "已捕获消息，但未匹配到可插入的按钮组";
            return result;
        } catch (error) {
            diagnostics.last = "菜单渲染异常：" + String(error).slice(0, 80);
            return result;
        }
    }
    function patchMessageModule(module, origin) {
        if (!active || !module || (typeof module !== "object" && typeof module !== "function") || touched.has(module)) return;
        var property = typeof module.default === "function" ? "default" : null;
        if (!property) return;
        try {
            var undo = after(property, module, function (args, result) {
                if (!active) return result;
                return addToMenuTree(result, args && args[0], origin);
            });
            touched.add(module);
            unpatches.push(undo);
            if (origin === "direct") diagnostics.foundDirect++;
            else diagnostics.foundLazy++;
            diagnostics.last = "已挂接消息菜单组件（" + origin + "）";
        } catch (error) {
            diagnostics.last = "菜单挂接失败：" + String(error).slice(0, 80);
        }
    }

    function patchDirectMessageComponents() {
        var findByName = v.metro.findByName;
        if (typeof findByName !== "function") return;
        var names = ["MessageLongPressActionSheet", "MessageActionSheet", "MessageContextMenu"];
        for (var i = 0; i < names.length; i++) {
            try {
                // Current finder implementations return a function with the
                // default argument and may return a raw module with false.
                // Patch only real module objects; a bare function cannot be
                // intercepted by patching a nonexistent .default property.
                var candidate = findByName(names[i], false);
                if (candidate && typeof candidate.default === "function")
                    patchMessageModule(candidate, "direct");
            } catch (e) { diagnostics.last = "查找消息组件失败: " + String(e).slice(0, 70); }
        }
    }

    function installMessageMenu() {
        // Attach to already-registered Discord message components. Patching only
        // openLazy misses menu components that are imported before the plugin runs.
        patchDirectMessageComponents();
        if (actionSheet && typeof actionSheet.openLazy === "function") {
            unpatches.push(before("openLazy", actionSheet, function (args) {
                try {
                    var key = args && args[1];
                    if (typeof key !== "string" || !/Message.*(ActionSheet|ContextMenu)/i.test(key)) return;
                    // openLazy receives an IMPORTER FUNCTION, not an already
                    // imported module. v1.1 did Promise.resolve(importer),
                    // which silently skipped all these menus.
                    var importer = args[0];
                    if (typeof importer !== "function") {
                        Promise.resolve(importer).then(function (module) {
                            if (active) patchMessageModule(module, "lazy-promise");
                        }).catch(function (e) { diagnostics.last = "导入失败:" + String(e); });
                        return;
                    }
                    args[0] = function () {
                        var self = this, callArgs = arguments;
                        return Promise.resolve().then(function () {
                            return importer.apply(self, callArgs);
                        }).then(function (module) {
                            if (!active) return module;
                            if (module && typeof module.default === "function") {
                                patchMessageModule(module, "lazy-function");
                            } else if (typeof module === "function") {
                                // Some importers resolve to a component function
                                // directly; wrap it instead of assuming .default.
                                var original = module;
                                return function (props) {
                                    var result = original.apply(this, arguments);
                                    return addToMenuTree(result, props, "lazy-component");
                                };
                            }
                            return module;
                        }).catch(function (e) {
                            diagnostics.last = "菜单导入失败:" + String(e).slice(0, 100);
                            throw e;
                        });
                    };
                } catch (_) {}
            }));
        }
        var menuModule = getSafe(findByProps, ["ContextMenu"]);
        if (menuModule && typeof menuModule.ContextMenu === "function") {
            unpatches.push(before("ContextMenu", menuModule, function (args) {
                try {
                    var props = args && args[0];
                    var text = messageText(props);
                    if (text && Array.isArray(props.items)) {
                        args[0] = Object.assign({}, props, { items: injectContextItems(props.items, text) });
                        diagnostics.inserted++;
                        diagnostics.last = "已注入 ContextMenu 项";
                    }
                } catch (_) {}
            }));
        }
        if (!diagnostics.foundDirect) diagnostics.last = "未定位到已加载消息组件，等待长按菜单触发";
    }

    function onLoad() {
        if (active) return;
        active = true;
        generation++;
        try {
            setupRuntime();
            bootSuccess = true;
            bootError = "已启动";
            installMessageMenu();
            toast("Text Selector 1.3 已启动（可以打开设置查看状态）");
        } catch (error) {
            bootSuccess = false;
            bootError = String(error);
            diagnostics.last = "启动失败：" + bootError;
            toast("Text Selector 启动失败，请查看插件设置");
        }
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
        diagnostics.foundDirect = 0;
        diagnostics.foundLazy = 0;
        diagnostics.menuOpened = 0;
        diagnostics.inserted = 0;
        diagnostics.noMessage = 0;
        diagnostics.noSection = 0;
        diagnostics.last = "插件已停用";
    }

    function settings() {
        // The settings function must exist even if the plugin could not boot.
        // It is the simplest way to observe a startup failure on the device.
        if (!React || !RN || !FormRow || !FormSection) {
            var react = React || (v && v.metro && v.metro.common && v.metro.common.React);
            var native = RN || (v && v.metro && v.metro.common && v.metro.common.ReactNative);
            if (react && native && native.Text)
                return react.createElement(native.Text, { style: { padding: 16 } }, "Text Selector 1.3 状态：" + bootError);
            return null;
        }
        return React.createElement(RN.ScrollView, { style: { flex: 1 } },
            React.createElement(FormSection, { title: "文字自由选择" },
                React.createElement(FormRow, {
                    label: "启动状态",
                    subLabel: bootSuccess ? "已启动；" + diagnostics.last : "启动失败；" + bootError
                }),
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
                    label: "检查菜单注入状态",
                    subLabel: "长按一次普通文字消息后点这里查看诊断",
                    onPress: function () {
                        var summary = "直接挂接:" + diagnostics.foundDirect +
                            " 懒加载挂接:" + diagnostics.foundLazy +
                            " 菜单渲染:" + diagnostics.menuOpened +
                            " 成功注入:" + diagnostics.inserted +
                            " 未读取到文字:" + diagnostics.noMessage +
                            " 未识别布局:" + diagnostics.noSection +
                            "；" + diagnostics.last;
                        if (v.ui.alerts && typeof v.ui.alerts.showConfirmationAlert === "function") {
                            v.ui.alerts.showConfirmationAlert({title: "Text Selector 诊断", content: summary, confirmText: "知道了"});
                        } else toast(summary);
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
