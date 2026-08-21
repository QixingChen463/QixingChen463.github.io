// ---------- Expandable [+] / [-] sections ----------

// The content panel is normally the element right after the .expand link, but
// when the link is wrapped in a heading the panel is the heading's next sibling.
function contentFor(elet) {
	return elet.nextElementSibling || (elet.parentElement && elet.parentElement.nextElementSibling);
}

function toggle_expandcontent() {
	this.classList.toggle("active");
	var content = contentFor(this);
	if (!content) return;
	if (content.style.maxHeight) {
		content.style.maxHeight = null;
	} else {
		content.style.maxHeight = content.scrollHeight + 100 + "px";
	}
	this.setAttribute("aria-expanded", this.classList.contains("active") ? "true" : "false");
}

// These are <a> without href, so the browser gives them no keyboard behaviour
// of their own; Enter and Space have to be wired up by hand.
function key_expandcontent(e) {
	if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
	e.preventDefault();
	toggle_expandcontent.call(this);
}

var expands = document.getElementsByClassName("expand");

for (var i = 0; i < expands.length; i++) {
	var elet = expands[i];
	// .oexpand marks a section that should start out open.
	if (elet.classList.contains("oexpand")) {
		elet.classList.add("active");
		elet.setAttribute("aria-expanded", "true");
		var content = contentFor(elet);
		if (content) content.style.maxHeight = content.scrollHeight + 100 + "px";
	}
	elet.addEventListener("click", toggle_expandcontent);
	elet.addEventListener("keydown", key_expandcontent);
}

// An open panel is sized in pixels, so re-measure it when the layout reflows.
window.addEventListener("resize", function () {
	for (var j = 0; j < expands.length; j++) {
		if (!expands[j].classList.contains("active")) continue;
		var c = contentFor(expands[j]);
		if (!c) continue;
		c.style.maxHeight = "none";
		var h = c.scrollHeight;
		c.style.maxHeight = h + 100 + "px";
	}
});

// ---------- Footer year ----------

var yearSpan = document.getElementById("currentYear");
if (yearSpan) yearSpan.textContent = new Date().getFullYear();
