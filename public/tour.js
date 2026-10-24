(function () {
  var steps = [
    { el: "#why-province", title: "Ontario rules built in", body: "Court application, estate tax return within 180 days, notice to creditors, and an estate tax estimate." },
    { el: "#why-forms", title: "Official forms, linked", body: "74A, ISP1200, TX19, T1 and T3 are named on the step that needs them, with a link to the official page. FinalChapter does not file them for you." },
    { el: "#why-circle", title: "Family & advisers", body: "Keep a list of family and advisers, and share a view-only progress link with them (Family and Professional). Responsibility stays with the estate trustee (the executor)." },
    { el: "#pricing", title: "Pay once", body: "Choose a plan, create an account and pay securely with Stripe. You come straight back to your checklist. Every plan includes the checklist, documents list, deadline dates, letters and guides. Family adds costs and family sharing. Professional adds up to five client estates." },
    { el: null, title: "What it is not", body: "FinalChapter is an organizer. It does not file forms for you and is not legal, tax or financial advice." }
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
    box.innerHTML = '<div style="background:#fff;color:#111;max-width:560px;width:100%;border-radius:14px;padding:14px 16px;border:2px solid #c026d3;box-shadow:0 12px 40px rgba(0,0,0,.35)"><p style="margin:0;color:#c026d3;font:12px system-ui;letter-spacing:.08em;text-transform:uppercase">How it works ' + (i + 1) + " / " + steps.length + '</p><h2 style="margin:4px 0 6px;font:700 20px Space Grotesk,sans-serif">' + s.title + '</h2><p style="margin:0 0 12px;font:15px/1.45 system-ui">' + s.body + '</p><div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" data-tour="close" style="border:1px solid #e5e7eb;background:#fff;border-radius:10px;padding:8px 12px">Close</button><button type="button" data-tour="next" style="border:0;background:#08080c;color:#fff;border-radius:10px;padding:8px 12px">' + (i === steps.length - 1 ? "Done" : "Next") + "</button></div></div>";
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
