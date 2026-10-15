(function () {
  function step(title, body) {
    return { title: title, body: body };
  }
  var steps = [
    step("Timeline", "Sixty Ontario steps, from the medical certificate to the final discharge. Open a step to see the form and the timing."),
    step("CRA", "Final T1, T3 if the estate earns, TX19 clearance, and the CPP/OAS notices. The desk names the form. It does not file it."),
    step("Letters", "Drafts for banks, Service Canada, and CRA. Copy or download, then review before you send."),
    step("Vault", "The file of what you collected: certificates, will, valuations, and notices. Keep the proof here."),
    step("Clearance", "TX19 is a separate step. Quiet is not the same as closed."),
    step("Not advice", "Verify with the Superior Court and CRA. Liability stays with the estate trustee.")
  ];
  var i = 0;
  var box;
  function close() {
    if (box && box.parentNode) box.parentNode.removeChild(box);
    box = null;
    try { localStorage.setItem("fc_tutorial_seen", "1"); } catch (e) {}
  }
  function show() {
    close();
    var s = steps[i];
    box = document.createElement("div");
    box.id = "fc-tour";
    box.style.cssText = "position:fixed;inset:0;background:rgba(8,8,12,.72);z-index:80;display:flex;align-items:flex-end;justify-content:center;padding:18px";
    box.innerHTML = '<div style="background:#fff;color:#111;max-width:520px;width:100%;border-radius:14px;padding:18px 18px 14px;border:2px solid #c026d3"><p style="margin:0;color:#c026d3;font:12px system-ui;letter-spacing:.08em;text-transform:uppercase">How this works ' + (i + 1) + " / " + steps.length + '</p><h2 style="margin:6px 0 8px;font:700 22px Space Grotesk,sans-serif">' + s.title + '</h2><p style="margin:0 0 14px;font:16px/1.45 system-ui">' + s.body + '</p><div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" data-tour="close" style="border:1px solid #e5e7eb;background:#fff;border-radius:10px;padding:8px 12px">Close</button><button type="button" data-tour="next" style="border:0;background:#08080c;color:#fff;border-radius:10px;padding:8px 12px">' + (i === steps.length - 1 ? "Done" : "Next") + "</button></div></div>";
    document.body.appendChild(box);
    box.querySelector('[data-tour="close"]').onclick = close;
    box.querySelector('[data-tour="next"]').onclick = function () {
      if (i === steps.length - 1) return close();
      i += 1;
      show();
    };
  }
  window.startFinalTour = function () { i = 0; show(); };
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("startTour");
    if (btn) btn.onclick = function () { window.startFinalTour(); };
    var seen = null;
    try { seen = localStorage.getItem("fc_tutorial_seen"); } catch (e) {}
    if (seen == null) setTimeout(window.startFinalTour, 600);
  });
})();
