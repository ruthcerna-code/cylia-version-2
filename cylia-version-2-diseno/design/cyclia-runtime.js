/*
 * cyclia-runtime.js
 * Motor mínimo para ver las pantallas de diseño de CYCLIA como HTML independiente.
 * Interpreta la plantilla <x-dc> de cada pantalla: huecos {{ ruta }}, <sc-for>, <sc-if>,
 * eventos onClick="{{ funcion }}" y la clase Component (renderVals / setState).
 * Sin dependencias: basta con abrir el .html en un navegador.
 */
(function () {
  'use strict';

  var renderFn = null;

  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
  }
  DCLogic.prototype.setState = function (patch, cb) {
    var next = typeof patch === 'function' ? patch(this.state, this.props) : patch;
    this.state = Object.assign({}, this.state, next);
    if (renderFn) renderFn();
    if (typeof cb === 'function') cb();
  };
  DCLogic.prototype.forceUpdate = function () { if (renderFn) renderFn(); };
  window.DCLogic = DCLogic;

  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

  function lookup(path, scopes) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^(['"]).*\1$/.test(path)) return path.slice(1, -1);
    var parts = path.split('.');
    for (var i = scopes.length - 1; i >= 0; i--) {
      var s = scopes[i];
      if (s && Object.prototype.hasOwnProperty.call(s, parts[0])) {
        var v = s[parts[0]];
        for (var k = 1; k < parts.length; k++) {
          if (v == null) return undefined;
          v = v[parts[k]];
        }
        return v;
      }
    }
    return undefined;
  }

  function interp(str, scopes) {
    return str.replace(HOLE, function (m, p) {
      var v = lookup(p, scopes);
      return v == null ? '' : String(v);
    });
  }

  function renderNodes(nodes, scopes, out) {
    for (var n = 0; n < nodes.length; n++) {
      var node = nodes[n];
      if (node.nodeType === 3) {
        var t = node.nodeValue;
        out.appendChild(document.createTextNode(t.indexOf('{{') >= 0 ? interp(t, scopes) : t));
        continue;
      }
      if (node.nodeType !== 1) continue;
      var tag = node.localName;
      if (tag === 'helmet') continue;
      if (tag === 'sc-for') {
        var list = lookup((node.getAttribute('list') || '').replace(WHOLE, '$1'), scopes) || [];
        var as = node.getAttribute('as') || 'item';
        for (var i = 0; i < list.length; i++) {
          var sc = { $index: i };
          sc[as] = list[i];
          renderNodes(node.childNodes, scopes.concat([sc]), out);
        }
        continue;
      }
      if (tag === 'sc-if') {
        if (lookup((node.getAttribute('value') || '').replace(WHOLE, '$1'), scopes)) {
          renderNodes(node.childNodes, scopes, out);
        }
        continue;
      }
      var el = node.namespaceURI && node.namespaceURI !== 'http://www.w3.org/1999/xhtml'
        ? document.createElementNS(node.namespaceURI, node.tagName)
        : document.createElement(node.tagName);
      for (var a = 0; a < node.attributes.length; a++) {
        var attr = node.attributes[a];
        var name = attr.name, val = attr.value;
        if (name.indexOf('hint-') === 0) continue;
        var whole = val.match(WHOLE);
        if (/^on[a-z]+$/i.test(name) && whole) {
          var fn = lookup(whole[1], scopes);
          if (typeof fn === 'function') el.addEventListener(name.slice(2).toLowerCase(), fn);
          continue;
        }
        if (whole) {
          var v = lookup(whole[1], scopes);
          if (v === false || v == null) continue;
          el.setAttribute(name, v === true ? '' : String(v));
        } else {
          el.setAttribute(name, val.indexOf('{{') >= 0 ? interp(val, scopes) : val);
        }
      }
      renderNodes(node.childNodes, scopes, el);
      out.appendChild(el);
    }
  }

  function snapshot(root) {
    var scroll = Array.prototype.map.call(root.querySelectorAll('main, [style*="overflow"]'), function (e) { return e.scrollTop; });
    var fields = Array.prototype.map.call(root.querySelectorAll('input, textarea'), function (e) {
      return e.type === 'checkbox' || e.type === 'radio' ? e.checked : e.value;
    });
    return { scroll: scroll, fields: fields };
  }
  function restore(root, snap) {
    Array.prototype.forEach.call(root.querySelectorAll('main, [style*="overflow"]'), function (e, i) {
      if (snap.scroll[i]) e.scrollTop = snap.scroll[i];
    });
    Array.prototype.forEach.call(root.querySelectorAll('input, textarea'), function (e, i) {
      if (snap.fields[i] === undefined) return;
      if (e.type === 'checkbox' || e.type === 'radio') e.checked = snap.fields[i];
      else e.value = snap.fields[i];
    });
  }

  function boot() {
    var host = document.querySelector('x-dc');
    if (!host) return;

    var helmet = host.querySelector('helmet');
    if (helmet) {
      Array.prototype.slice.call(helmet.children).forEach(function (c) { document.head.appendChild(c); });
    }
    var page = document.createElement('style');
    page.textContent = 'html{background:#D7E3F4}x-dc{display:flex;justify-content:center;min-height:100vh}';
    document.head.appendChild(page);

    var template = Array.prototype.slice.call(host.childNodes);
    template.forEach(function (c) { host.removeChild(c); });

    var src = document.querySelector('script[data-dc-script]');
    var Component = src ? new Function('DCLogic', src.textContent + '\nreturn Component;')(DCLogic) : null;
    var inst = Component ? new Component({}) : { renderVals: function () { return {}; } };
    if (!inst.state) inst.state = {};

    var first = true;
    renderFn = function () {
      var snap = first ? null : snapshot(host);
      var frag = document.createDocumentFragment();
      renderNodes(template, [inst.renderVals() || {}], frag);
      host.replaceChildren(frag);
      if (snap) restore(host, snap);
      if (first) {
        first = false;
        if (typeof inst.componentDidMount === 'function') inst.componentDidMount();
      }
    };
    renderFn();
  }

  // Los formularios del prototipo no envían datos: evita que la página se recargue.
  document.addEventListener('submit', function (e) { e.preventDefault(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
