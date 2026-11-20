/* dc-lite: renders the page's <template id="view"> with {{ bindings }},
   <sc-if value="{{ x }}"> and <sc-for list="{{ xs }}" as="x"> blocks, the same
   markup the design canvas uses. A page defines a Component class with
   renderVals() and calls DC.mount(Component). setState() re-renders. */
(function () {
  var BIND = /\{\{\s*([\w$.]+)\s*\}\}/g;
  var SINGLE = /^\s*\{\{\s*([\w$.]+)\s*\}\}\s*$/;
  var BOOL = { disabled: 1, checked: 1, hidden: 1, selected: 1, required: 1, open: 1 };

  function lookup(path, scope) {
    var parts = path.split('.'), v = scope;
    for (var i = 0; i < parts.length; i++) { if (v == null) return undefined; v = v[parts[i]]; }
    return v;
  }
  function text(str, scope) {
    return str.replace(BIND, function (_, p) { var v = lookup(p, scope); return v == null ? '' : String(v); });
  }
  function single(str, scope) { var m = SINGLE.exec(str || ''); return m ? lookup(m[1], scope) : undefined; }

  function render(parent, nodes, scope) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.nodeType === 3) { parent.appendChild(document.createTextNode(text(n.nodeValue, scope))); continue; }
      if (n.nodeType !== 1) continue;
      var tag = n.localName;
      if (tag === 'sc-if') { if (single(n.getAttribute('value'), scope)) render(parent, n.childNodes, scope); continue; }
      if (tag === 'sc-for') {
        var list = single(n.getAttribute('list'), scope) || [], as = n.getAttribute('as') || 'item';
        for (var j = 0; j < list.length; j++) { var s = Object.create(scope); s[as] = list[j]; render(parent, n.childNodes, s); }
        continue;
      }
      var el = n.namespaceURI && n.namespaceURI !== 'http://www.w3.org/1999/xhtml'
        ? document.createElementNS(n.namespaceURI, n.tagName) : document.createElement(tag);
      for (var a = 0; a < n.attributes.length; a++) {
        var at = n.attributes[a], name = at.name, val = at.value;
        if (name.indexOf('hint-') === 0) continue;
        if (name.indexOf('on') === 0 && SINGLE.test(val)) {
          var fn = single(val, scope); if (typeof fn === 'function') el.addEventListener(name.slice(2), fn);
          continue;
        }
        if (BOOL[name] && SINGLE.test(val)) { if (single(val, scope)) el.setAttribute(name, ''); continue; }
        el.setAttribute(name, text(val, scope));
      }
      if (tag === 'input' && el.hasAttribute('value')) el.value = el.getAttribute('value');
      render(el, (n.content || n).childNodes, scope);
      parent.appendChild(el);
    }
  }

  function focusKey(el) {
    if (!el || el === document.body) return null;
    return { id: el.id, label: el.getAttribute && el.getAttribute('aria-label'), text: (el.textContent || '').trim(), tag: el.tagName };
  }
  function refocus(root, k) {
    if (!k) return;
    var el = k.id ? root.querySelector('#' + CSS.escape(k.id)) : null;
    if (!el) {
      var all = root.querySelectorAll(k.tag);
      for (var i = 0; i < all.length && !el; i++) {
        var c = all[i];
        if ((k.label && c.getAttribute('aria-label') === k.label) || (!k.label && (c.textContent || '').trim() === k.text)) el = c;
      }
    }
    if (el && !el.disabled) el.focus({ preventScroll: true });
  }

  window.DCLogic = function (props) { this.props = props || {}; this.state = {}; };
  window.DCLogic.prototype.setState = function (patch) {
    for (var k in patch) this.state[k] = patch[k];
    if (this._render) this._render();
  };

  window.DC = {
    mount: function (Component, props) {
      var tpl = document.getElementById('view'), root = document.getElementById('app');
      var comp = new Component(props || {});
      comp._render = function () {
        var k = root.contains(document.activeElement) ? focusKey(document.activeElement) : null;
        var frag = document.createDocumentFragment();
        render(frag, tpl.content.childNodes, comp.renderVals());
        root.replaceChildren(frag);
        refocus(root, k);
      };
      comp._render();
      if (comp.didMount) comp.didMount();
      return comp;
    }
  };
})();
