(function () {
  var steps = [
    { tab: "timeline", title: "Timeline", body: "Sixty Ontario steps. This is a read-only peek. Pay to open a step and mark it done." },
    { tab: "cra", title: "CRA", body: "Final T1, T3, and the TX19 cover letter with the holdback note. The desk names the form. It does not file it." },
    { tab: "letters", title: "Letters", body: "Drafts for banks and others. Copy and download unlock after you pay." },
    { tab: "vault", title: "Vault", body: "Where certificates, the will, and notices live. Keep the proof here." },
    { tab: "videos", title: "Slides", body: "Short cartoon decks on the death certificate, the will, the estate account, and clearance." }
  ];
  var i = 0;
  var box;
  function close() {
    if (box && box.parentNode) box.parentNode.removeChild(box);
    box = null;
    if (window.setPreview) window.setPreview(false);
    if (window.render) window.render();
  }
  function go() {
    var s = steps[i];
    if (window.setPreview) window.setPreview(true);
    if (window.state) window.state.tab = s.tab;
    if (window.render) window.render();
    var os = document.getElementById("os");
    if (os) os.scrollIntoView({ behavior: "smooth" });
    if (box && box.parentNode) box.parentNode.removeChild(box);
    box = document.createElement("div");
    box.id = "fc-tour";
    box.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:80;display:flex;justify-content:center;padding:12px;pointer-events:none";
    box.innerHTML = '<div style="pointer-events:auto;background:#fff;color:#111;max-width:560px;width:100%;border-radius:14px;padding:14px 16px;border:2px solid #c026d3;box-shadow:0 12px 40px rgba(0,0,0,.35)"><p style="margin:0;color:#c026d3;font:12px system-ui;letter-spacing:.08em;text-transform:uppercase">Sneak peek ' + (i + 1) + " / " + steps.length + '</p><h2 style="margin:4px 0 6px;font:700 20px Space Grotesk,sans-serif">' + s.title + '</h2><p style="margin:0 0 12px;font:15px/1.45 system-ui">' + s.body + '</p><div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" data-tour="close" style="border:1px solid #e5e7eb;background:#fff;border-radius:10px;padding:8px 12px">Close</button><button type="button" data-tour="next" style="border:0;background:#08080c;color:#fff;border-radius:10px;padding:8px 12px">' + (i === steps.length - 1 ? "Done" : "Next") + "</button></div></div>";
    document.body.appendChild(box);
    box.querySelector('[data-tour="close"]').onclick = close;
    box.querySelector('[data-tour="next"]').onclick = function () {
      if (i === steps.length - 1) return close();
      i += 1;
      go();
    };
  }
  window.startFinalTour = function () { i = 0; go(); };
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("startTour");
    if (btn) btn.onclick = function () { window.startFinalTour(); };
  });
})();
