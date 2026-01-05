(function () {
  const root = document.documentElement;
  const btn = document.getElementById("themeToggle");
  const year = document.getElementById("year");

  if (year) year.textContent = String(new Date().getFullYear());

  function setTheme(theme) {
    if (theme === "light") {
      root.setAttribute("data-theme", "light");
      if (btn) btn.textContent = "☀️";
    } else {
      root.removeAttribute("data-theme");
      if (btn) btn.textContent = "🌙";
    }
    localStorage.setItem("theme", theme);
  }

  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") {
    setTheme(saved);
  } else {
    // 默认跟随系统
    const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    setTheme(prefersLight ? "light" : "dark");
  }

  if (btn) {
    btn.addEventListener("click", () => {
      const current = root.getAttribute("data-theme") === "light" ? "light" : "dark";
      setTheme(current === "light" ? "dark" : "light");
    });
  }
})();
