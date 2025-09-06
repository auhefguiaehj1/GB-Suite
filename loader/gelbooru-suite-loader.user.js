// ==UserScript==
// @name         Gelbooru Suite (Loader)
// @namespace    anon.suite
// @version      1.0.0
// @description  Lädt Core + Module aus GitHub
// @match        https://gelbooru.com/index.php?page=post&s=list*
// @match        https://gelbooru.com/index.php?page=post&s=view*
// @grant        none
// @require      https://raw.githubusercontent.com/auhefguiaehj1/GB-Suite/main/mods/gb.core.js
// @require      https://raw.githubusercontent.com/auhefguiaehj1/GB-Suite/main/mods/gb.mod.blacklist.js
// @require      https://raw.githubusercontent.com/auhefguiaehj1/GB-Suite/main/mods/gb.mod.favorites.js
// @require      https://raw.githubusercontent.com/auhefguiaehj1/GB-Suite/main/mods/gb.mod.infinite.js
// @require      https://raw.githubusercontent.com/auhefguiaehj1/GB-Suite/main/mods/gb.mod.taggroups.js
// ==/UserScript==

(function(){ window.GBSuite?.start?.(); })();
