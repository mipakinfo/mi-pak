const sidebar = document.querySelector(".sidebar");
const menuToggle = document.getElementById("menu-toggle");
const EDGE_HIT_WIDTH = 6;
let startX, startWidth;

// MOBILE MENU: below the breakpoint the sidebar is an off-canvas drawer
// toggled by the "Menu" button instead of the always-visible column.
if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    sidebar.classList.toggle("sidebar--mobile-open");
  });

  document.addEventListener("click", (e) => {
    if (!sidebar.classList.contains("sidebar--mobile-open")) return;
    if (sidebar.contains(e.target) || e.target === menuToggle) return;
    sidebar.classList.remove("sidebar--mobile-open");
  });
}

function isOnEdge(e) {
  const rect = sidebar.getBoundingClientRect();
  return Math.abs(rect.right - e.clientX) <= EDGE_HIT_WIDTH;
}

document.addEventListener("mousemove", (e) => {
  if (sidebar.classList.contains("sidebar--resizing")) return;
  document.body.style.cursor = isOnEdge(e) ? "col-resize" : "";
});

document.addEventListener("mousedown", (e) => {
  if (!isOnEdge(e)) return;
  startX = e.clientX;
  startWidth = sidebar.getBoundingClientRect().width;
  sidebar.classList.add("sidebar--resizing");
  document.body.style.userSelect = "none";
  document.body.style.cursor = "col-resize";
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
});

const COLLAPSE_THRESHOLD = 60;

function onMouseMove(e) {
  const newWidth = startWidth + (e.clientX - startX);
  if (newWidth < COLLAPSE_THRESHOLD) {
    sidebar.style.width = "0px";
    sidebar.classList.add("sidebar--collapsed");
  } else {
    sidebar.classList.remove("sidebar--collapsed");
    sidebar.style.width = Math.min(newWidth, 500) + "px";
  }
}

function onMouseUp() {
  sidebar.classList.remove("sidebar--resizing");
  document.body.style.userSelect = "";
  document.body.style.cursor = "";
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
}
