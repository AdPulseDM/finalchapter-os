(function () {
  var steps = [
    { el: "#why-province", title: "Province logic", body: "Certificate of Appointment, the 180-day Estate Information Return, creditor notice, and current estate administration tax." },
    { el: "#why-forms", title: "Forms on the path", body: "74A, ISP1200, TX19, T1, and T3 are named on the step. This desk does not file them for you." },
    { el: "#why-circle", title: "Circle, not chaos", body: "Family and counsel share a feed. Liability stays with the estate trustee." },
    { el: "#pricing", title: "One-time unlock", body: "Create an account, pay once through Stripe, then log in. Timeline, vault, CRA, letters, costs, circle, and slides unlock for your account." },
    { el: null, title: "What unlocks", body: "Timeline of 60 steps. Vault for proof. CRA deadlines and the TX19 letter. Letters you can copy. Costs. Circle. Slides. It does not file forms. Not legal, tax, or financial advice." }
  ];
  var i = 0;
  var box;
  function clearHighlight() {
    document.querySelectorAll(".tour-on").forEach(function (n) { n.classList.remove("tour-on"); });
  }
  function close() {
    clearHighlight();
    if (box && box.parentNode) box.parentNode.removeChild(box);
    box = null;
  }
  function go() {
    clearHighlight();
    var s = steps[i];
    if (s.el) {
      var node = document.querySelector(s.el);
      if (node) {
        node.classList.add("tour-on");
        node.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    if (box && box.parentNode) box.parentNode.removeChild(box);
    box = document.createElement("div");
    box.id = "fc-tour";
    box.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:90;display:flex;justify-content:center;padding:12px";
    box.innerHTML = '<div style="background:#fff;color:#111;max-width:560px;width:100%;border-radius:14px;padding:14px 16px;border:2px solid #c026d3;box-shadow:0 12px 40px rgba(0,0,0,.35)"><p style="margin:0;color:#c026d3;font:12px system-ui;letter-spacing:.08em;text-transform:uppercase">How this works ' + (i + 1) + " / " + steps.length + '</p><h2 style="margin:4px 0 6px;font:700 20px Space Grotesk,sans-serif">' + s.title + '</h2><p style="margin:0 0 12px;font:15px/1.45 system-ui">' + s.body + '</p><div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" data-tour="close" style="border:1px solid #e5e7eb;background:#fff;border-radius:10px;padding:8px 12px">Close</button><button type="button" data-tour="next" style="border:0;background:#08080c;color:#fff;border-radius:10px;padding:8px 12px">' + (i === steps.length - 1 ? "Done" : "Next") + "</button></div></div>";
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
