const contentDiv = document.getElementById("content");

const DOC_URL = "https://docs.google.com/document/d/e/2PACX-1vRXpeVYutQdexBk9LDvrZb6-LMTxhF0lWrSV4I-vFtPZvlC8vj2r5MhT-euiloJMVKl8Cwf0Va5JzOa/pub?embedded=true";

// page definitions
const pages = {
  home: { path: DOC_URL, type: "gdoc" },
  about: { path: "about.txt", type: "text" },
  contact: { path: "contact.txt", type: "text" },
  projects: { path: "projects.json", type: "projects" },
};

window.addEventListener("hashchange", loadPage);
window.addEventListener("load", loadPage);

async function loadPage() {
  const pageName = location.hash.replace("#", "") || "home";
  const page = pages[pageName];

  if (!page) {
    contentDiv.innerHTML = "<p>Page not found.</p>";
    return;
  }

  contentDiv.textContent = "Loading...";

  try {
    const data = await fetchContent(page.path, page.type);
    renderers[page.type](data);
  } catch (err) {
    console.error(err);
    contentDiv.textContent = "Error loading content.";
  }
}

async function fetchContent(path, type) {
  if (type === "gdoc") {
    const res = await fetch(path);
    return await res.text(); // raw HTML
  }

  const res = await fetch(path);
  if (!res.ok) throw new Error("Failed to fetch " + path);

  if (type === "projects") return res.json();
  return res.text();
}

const renderers = {
  text: text => {
    text = text
      .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>')
      .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '<a href="mailto:$1">$1</a>');
    contentDiv.innerHTML = `<pre>${text}</pre>`;
  },

  gdoc: html => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  doc.querySelectorAll("script").forEach(s => s.remove());
  document.querySelectorAll("style[data-gdoc]").forEach(s => s.remove());
  const styles = doc.querySelectorAll("style");
  styles.forEach(style => {
    const cloned = style.cloneNode(true);
    cloned.setAttribute("data-gdoc", "");
    cloned.innerHTML = cloned.innerHTML.replace(/\}/g, '}.gdoc ');
    document.head.appendChild(cloned);
  });
  const body = doc.querySelector("body");
  const gdocContainer = document.createElement("div");
  gdocContainer.classList.add("gdoc");
  gdocContainer.innerHTML = body.innerHTML;
  contentDiv.innerHTML = "";
  contentDiv.appendChild(gdocContainer);
},

projects: projects => {
  const container = document.createElement("div");
  container.classList.add("projects");

  projects.forEach(p => {
    const card = document.createElement("div");
    card.classList.add("project-card");

    if (p.image && p.image.trim() !== "") {
      const img = document.createElement("img");
      img.src = p.image;
      img.alt = p.title;
      img.classList.add("project-img");
      img.onerror = () => img.remove();
      card.appendChild(img);
    }

    card.innerHTML += `
      <h2>${p.title}</h2>
      <p>${p.description}</p>
      <div class="long-desc hidden">${p.longDescription}</div>
      <a href="${p.link}" target="_blank" class="project-link">View project</a>
      <button class="read-more">Read more</button>
    `;

    card.querySelector(".read-more").onclick = e => {
      const desc = card.querySelector(".long-desc");
      desc.classList.toggle("hidden");
      e.target.textContent = desc.classList.contains("hidden") ? "Read more" : "Hide";
    };

    container.appendChild(card);
  });

  contentDiv.innerHTML = "";
  contentDiv.appendChild(container);
},
};
