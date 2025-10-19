const contentDiv = document.getElementById("content");

const DOC_URL = "https://docs.google.com/document/d/e/2PACX-1vRXpeVYutQdexBk9LDvrZb6-LMTxhF0lWrSV4I-vFtPZvlC8vj2r5MhT-euiloJMVKl8Cwf0Va5JzOa/pub?embedded=true";

// page definitions
const pages = {
  home: DOC_URL,
  about: "about.txt",
  contact: "contact.txt",
};

window.addEventListener("hashchange", loadPage);
window.addEventListener("load", loadPage);

async function loadPage() {
  const page = location.hash.replace("#", "") || "home";
  const src = pages[page];

  if (!src) {
    contentDiv.innerHTML = "<p>Page not found.</p>";
    return;
  }

  contentDiv.textContent = "Loading...";

  try {
    if (src.includes("docs.google.com")) {
      await loadGoogleDoc(src);
    } else {
      await loadTextFile(src);
    }
  } catch (err) {
    console.error(err);
    contentDiv.textContent = "Error loading content.";
  }
}

async function loadGoogleDoc(url) {
  const res = await fetch(url);
  const html = await res.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  doc.querySelectorAll("script").forEach(s => s.remove());

  const styles = doc.querySelectorAll("style");
  styles.forEach(style => {
    style.innerHTML = style.innerHTML.replace(/\}/g, '}.gdoc ');
    document.head.appendChild(style.cloneNode(true));
  });

  const body = doc.querySelector("body");
  const gdocContainer = document.createElement("div");
  gdocContainer.classList.add("gdoc");
  gdocContainer.innerHTML = body.innerHTML;

  contentDiv.innerHTML = "";
  contentDiv.appendChild(gdocContainer);
}

async function loadTextFile(path) {
  const res = await fetch(path);
  let text = await res.text();

  // link and email detection
  text = text
    // Links (http/https)
    .replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    )
    // Emails
    .replace(
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
      '<a href="mailto:$1">$1</a>'
    );

  // Markdown support if file ends with .md
  if (path.endsWith(".md") && window.marked) {
    text = marked.parse(text);
    contentDiv.innerHTML = `<div class="markdown">${text}</div>`;
  } else {
    contentDiv.innerHTML = `<pre>${text}</pre>`;
  }
}
