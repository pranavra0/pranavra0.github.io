const contentDiv = document.getElementById("content");

window.addEventListener("hashchange", loadPage);
window.addEventListener("load", loadPage);

function loadPage() {
  const page = location.hash.replace("#", "") || "home";
  if (page === "home" ) {
    fetchGoogleDoc();
  } else if (page === "about") {
    fetchAboutMD();
  } else {
    contentDiv.innerHTML = "<p>Page not found.</p>";
  }
}

const DOC_URL = "https://docs.google.com/document/d/e/2PACX-1vRXpeVYutQdexBk9LDvrZb6-LMTxhF0lWrSV4I-vFtPZvlC8vj2r5MhT-euiloJMVKl8Cwf0Va5JzOa/pub?embedded=true";

async function fetchGoogleDoc() {
  try {
    const res = await fetch(DOC_URL);
    const html = await res.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const styles = doc.querySelectorAll("style");
    styles.forEach(style => {
      style.innerHTML = style.innerHTML.replace(/\}/g, '}.gdoc ');
      document.head.appendChild(style.cloneNode(true));
    });

    doc.querySelectorAll("script").forEach(s => s.remove());

    const body = doc.querySelector("body");
    const gdocContainer = document.createElement("div");
    gdocContainer.classList.add("gdoc");
    gdocContainer.innerHTML = body.innerHTML;

    contentDiv.innerHTML = "";
    contentDiv.appendChild(gdocContainer);
  } catch (err) {
    console.error(err);
    contentDiv.textContent = "Error loading content.";
  }
}

async function fetchAboutMD() {
  try {
    const res = await fetch("about.md");
    const text = await res.text();

    contentDiv.innerHTML = `<pre>${text}</pre>`;
  } catch (err) {
    console.error(err);
    contentDiv.textContent = "Error loading About page.";
  }
}
