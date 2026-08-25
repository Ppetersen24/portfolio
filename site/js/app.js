(() => {
  "use strict";

  const state = {
    content: null,
    overrides: null,
    artifacts: new Map(),
    lastFocus: null,
    lastDialogFocus: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const escapeHTML = (value = "") => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  async function loadJSON(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
    return response.json();
  }

  async function init() {
    try {
      [state.content, state.overrides] = await Promise.all([
        loadJSON("content/site-content.json"),
        loadJSON("content/approved-overrides.json")
      ]);

      document.title = state.content.meta.title;
      const metaDescription = $("meta[name='description']");
      if (metaDescription) metaDescription.content = state.content.meta.description;

      registerArtifacts();
      renderNavigation();
      renderMasthead();
      renderChapters();
      renderCapabilities();
      renderMaterials();
      renderFooter();
      wireUI();
      setupReveal();
      window.addEventListener("hashchange", applyRoute);
      applyRoute();
    } catch (error) {
      console.error(error);
      $("#main").innerHTML = `
        <section class="masthead">
          <p class="micro-label">Local setup</p>
          <h1 style="font-size:clamp(44px,8vw,96px)">Content could not load.</h1>
          <p class="chapter-narrative" style="max-width:700px;margin-top:30px">Serve the site with <code>python run_local.py</code> rather than opening index.html directly. If it is already running, hard reload the page: Cmd Shift R.</p>
        </section>`;
    }
  }

  function registerArtifacts() {
    state.content.chapters.forEach((chapter) => {
      if (chapter.keyImage && chapter.keyImage.src) {
        state.artifacts.set(chapter.keyImage.id, chapter.keyImage);
      }
      if (chapter.sceneImage && chapter.sceneImage.src) {
        state.artifacts.set(chapter.sceneImage.id, chapter.sceneImage);
      }
      (chapter.artifacts || []).forEach((artifact) => state.artifacts.set(artifact.id, artifact));
    });
    // Chapter entries carry alt text the Materials list does not, so a supplementary
    // item only registers when nothing has claimed that id already.
    state.content.supplementary.forEach((artifact) => {
      if (!state.artifacts.has(artifact.id)) state.artifacts.set(artifact.id, artifact);
    });
  }

  function keyPhoto(image, modifier = "") {
    // One photograph carrying a section: a clean documentary frame, no mask,
    // scale and crop set per chapter. The full frame stays one click away.
    if (!image || !image.src) return "";
    const focus = image.focus ? ` style="object-position:${escapeHTML(image.focus)}"` : "";
    return `
      <button class="chapter-key__button" type="button" data-artifact-id="${escapeHTML(image.id)}" aria-label="Enlarge: ${escapeHTML(image.caption || image.alt || "photograph")}">
        <span class="chapter-key__frame">
          <img src="${escapeHTML(image.src)}" alt="${escapeHTML(image.alt || "")}" width="${image.width || ""}" height="${image.height || ""}"${focus}>
        </span>
        <span class="chapter-key__zoom" aria-hidden="true">Enlarge</span>
      </button>`;
  }

  // Chapters render through this map. A chapter id missing from it gets no nav
  // link and no section rather than a dead anchor or a blank page.
  const CHAPTER_RENDERERS = {
    "uo": (chapter) => renderUOChapter(chapter),
    "fisher": (chapter) => renderFisherChapter(chapter),
    "sga-intern": (chapter) => renderInternChapter(chapter),
    "consulting": (chapter) => renderConsultingChapter(chapter)
  };

  function renderableChapters() {
    return state.content.chapters.filter((chapter) => {
      if (CHAPTER_RENDERERS[chapter.id]) return true;
      console.warn(`No renderer for chapter "${chapter.id}"; it will not appear on the page.`);
      return false;
    });
  }

  function renderNavigation() {
    const nav = $("#siteNav");
    const links = [
      ...renderableChapters().map((chapter, index) => ({
        index: String(index + 1).padStart(2, "0"),
        label: chapter.navLabel || chapter.title,
        title: chapter.title,
        href: `#${chapter.id}`
      }))
    ];
    nav.innerHTML = links.map((item) => `
      <a href="${escapeHTML(item.href)}" title="${escapeHTML(item.title)}" aria-label="${escapeHTML(item.title)}">
        ${item.index ? `<span class="site-nav__index" aria-hidden="true">${escapeHTML(item.index)}</span>` : ""}
        <span aria-hidden="true">${escapeHTML(item.label)}</span>
      </a>`).join("");
  }

  function renderMasthead() {
    const m = state.content.masthead;
    $("#top").innerHTML = `
      <h1 id="mastheadName" class="reveal">${escapeHTML(m.name)}</h1>
      <p class="masthead__role reveal">${escapeHTML(m.roleLine)}</p>
      ${m.about ? `<p class="masthead__about reveal">${escapeHTML(m.about)}</p>` : ""}
      <div class="masthead__contact reveal">
        <span class="contact-place">${escapeHTML(m.location)}</span>
        <a class="contact-email" href="mailto:${escapeHTML(m.email)}">${escapeHTML(m.email)}</a>
        <a class="contact-phone" href="tel:${escapeHTML(m.phoneHref || m.phone)}">${escapeHTML(m.phone)}</a>
        <a class="contact-linkedin" href="${escapeHTML(m.linkedin)}" target="_blank" rel="noreferrer">LinkedIn</a>
        <a class="contact-github" href="${escapeHTML(m.github)}" target="_blank" rel="noreferrer">GitHub</a>
      </div>
      <nav class="landing-index reveal" aria-label="Explore">
        <p class="micro-label">Explore</p>
        ${renderableChapters().map((chapter) => `
          <a class="landing-index__row" href="#${escapeHTML(chapter.id)}">
            <span class="landing-index__num" aria-hidden="true">${escapeHTML(chapter.number)}</span>
            <span class="landing-index__title">${escapeHTML(chapter.title)}</span>
            <span class="landing-index__meta">${escapeHTML(chapter.years || chapter.dates || "")}</span>
          </a>`).join("")}
        <a class="landing-index__row" href="#capabilities">
          <span class="landing-index__num" aria-hidden="true">05</span>
          <span class="landing-index__title">Skills and awards</span>
          <span class="landing-index__meta"></span>
        </a>
      </nav>`;
  }

  function chapterNext(chapter) {
    const chapters = renderableChapters();
    const index = chapters.findIndex((c) => c.id === chapter.id);
    const next = chapters[index + 1];
    const href = next ? `#${next.id}` : "#capabilities";
    const label = next ? `Next · ${next.number} ${next.navLabel || next.title}` : "Next · Skills and awards";
    return `
      <div class="chapter-next">
        <a class="text-action" href="#top"><span>Index</span><span aria-hidden="true">↑</span></a>
        <a class="text-action" href="${escapeHTML(href)}"><span>${escapeHTML(label)}</span><span aria-hidden="true">→</span></a>
      </div>`;
  }

  function renderChapters() {
    const container = $("#chapters");
    container.innerHTML = renderableChapters().map((chapter) => {
      try {
        return CHAPTER_RENDERERS[chapter.id](chapter);
      } catch (error) {
        // A malformed chapter must not blank the whole page; keep the heading so
        // the nav anchor still lands somewhere.
        console.error(`Chapter "${chapter.id}" failed to render`, error);
        return `<article class="chapter reveal" id="${escapeHTML(chapter.id)}" data-nav-label="${escapeHTML(chapter.title)}">${renderChapterHeading(chapter)}</article>`;
      }
    }).join("");
  }

  function narrativeHTML(narrative) {
    const paragraphs = Array.isArray(narrative) ? narrative : narrative ? [narrative] : [];
    return paragraphs.map((p) => `<p class="chapter-narrative">${escapeHTML(p)}</p>`).join("");
  }

  function sceneImage(image) {
    if (!image || !image.src) return "";
    const focus = image.focus ? ` style="object-position:${escapeHTML(image.focus)}"` : "";
    return `
      <button class="scene-frame" type="button" data-artifact-id="${escapeHTML(image.id)}" aria-label="Enlarge: ${escapeHTML(image.caption || image.alt || "photograph")}">
        <img src="${escapeHTML(image.src)}" alt="${escapeHTML(image.alt || "")}" width="${image.width || ""}" height="${image.height || ""}"${focus}>
        <span class="frame-caption">${escapeHTML(image.caption || "")}</span>
      </button>`;
  }

  function renderUOChapter(chapter) {
    return `
      <article class="chapter reveal" id="${escapeHTML(chapter.id)}" data-nav-label="${escapeHTML(chapter.title)}">
        ${renderChapterHeading(chapter)}
        <div class="chapter-content">
          <div class="chapter-facts">${(chapter.facts || []).map((fact) => `<span>${escapeHTML(fact)}</span>`).join("")}</div>
          ${sceneImage(chapter.sceneImage)}
          <div class="chapter-grid">
            <div>
              ${narrativeHTML(chapter.narrative)}
              <div class="artifact-actions">${renderArtifactButtons(chapter.artifacts)}</div>
              <div class="context-rows">
                ${(chapter.contextRows || []).map((row) => `
                  <div class="context-row">
                    <h3>${escapeHTML(row.heading)}<span>${escapeHTML(row.date)}</span></h3>
                    <p>${escapeHTML(row.text)}</p>
                  </div>`).join("")}
              </div>
              <p class="graduation-line"><strong>Graduated</strong> · June 2025</p>
            </div>
            <div class="chapter-key chapter-key--uo">${keyPhoto(chapter.keyImage)}</div>
          </div>
          ${chapterNext(chapter)}
        </div>
      </article>`;
  }

  function renderFisherChapter(chapter) {
    const leaderboard = (chapter.artifacts || []).find((a) => a.inline);
    const rest = (chapter.artifacts || []).filter((a) => !a.inline);
    return `
      <article class="chapter reveal" id="${escapeHTML(chapter.id)}" data-nav-label="${escapeHTML(chapter.title)}">
        ${renderChapterHeading(chapter)}
        <div class="chapter-content">
          <div class="chapter-grid">
            <div>
              <p class="role-line">${escapeHTML(chapter.role)}<span>${escapeHTML(chapter.dates)}</span></p>
              <ul class="fact-list">${(chapter.bullets || []).map((bullet) => `<li>${escapeHTML(bullet)}</li>`).join("")}</ul>
              <p class="result-statement">${escapeHTML(chapter.result)}</p>
              ${leaderboard ? `
                <button class="inline-record" type="button" data-artifact-id="${escapeHTML(leaderboard.id)}" aria-label="Enlarge: ${escapeHTML(leaderboard.caption)}">
                  <img src="${escapeHTML(leaderboard.src)}" alt="${escapeHTML(leaderboard.alt || "")}" width="${leaderboard.width || ""}" height="${leaderboard.height || ""}">
                  <span class="frame-caption">${escapeHTML(leaderboard.caption || "")}</span>
                </button>` : ""}
              ${rest.length ? `<div class="artifact-actions">${renderArtifactButtons(rest)}</div>` : ""}
            </div>
            <div class="chapter-key chapter-key--fisher">${keyPhoto(chapter.keyImage)}</div>
          </div>
          ${chapterNext(chapter)}
        </div>
      </article>`;
  }

  function renderInternChapter(chapter) {
    return `
      <article class="chapter reveal" id="${escapeHTML(chapter.id)}" data-nav-label="${escapeHTML(chapter.title)}">
        ${renderChapterHeading(chapter)}
        <div class="chapter-content">
          <div class="chapter-grid chapter-grid--reverse">
            <div class="chapter-copy">
              <p class="role-line">${escapeHTML(chapter.role)}<span>${escapeHTML(chapter.dates)}</span></p>
              <ul class="fact-list">${(chapter.bullets || []).map((bullet) => `<li>${escapeHTML(bullet)}</li>`).join("")}</ul>
            </div>
            <div class="chapter-key chapter-key--sga">${keyPhoto(chapter.keyImage)}</div>
          </div>
          ${chapterNext(chapter)}
        </div>
      </article>`;
  }

  function renderConsultingChapter(chapter) {
    const employer = state.overrides.consultingEmployer || chapter.org || "";
    const extraResults = state.overrides.consultingResults || [];

    return `
      <article class="chapter reveal" id="${escapeHTML(chapter.id)}" data-nav-label="${escapeHTML(chapter.title)}">
        ${renderChapterHeading(chapter)}
        <div class="chapter-content">
          <p class="role-line">${escapeHTML(employer)}${chapter.location ? ` · ${escapeHTML(chapter.location)}` : ""}<span>${escapeHTML(chapter.dates)}</span></p>
          ${narrativeHTML(chapter.summary)}
          <div class="system-ledger">
            ${(chapter.systems || []).map((system, index) => `
              <div class="system-entry">
                <span class="system-entry__index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
                <div class="system-entry__name">
                  <strong>${escapeHTML(system.name)}</strong>
                  <span class="system-flow">${escapeHTML(system.flow || "")}</span>
                </div>
                <p>${escapeHTML(system.text)}${system.name === "Top Ten" && state.overrides.portfolioReviewMetric ? ` ${escapeHTML(state.overrides.portfolioReviewMetric)}` : ""}</p>
              </div>`).join("")}
          </div>
          ${extraResults.length ? `<ul class="fact-list" style="margin-top:28px">${extraResults.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>` : ""}
          <div class="artifact-actions">${renderArtifactButtons(chapter.artifacts)}</div>
          ${chapterNext(chapter)}
        </div>
      </article>`;
  }

  function renderChapterHeading(chapter) {
    return `
      <div class="chapter-heading">
        <div class="chapter-heading__number" aria-hidden="true">${escapeHTML(chapter.number)}</div>
        <div>
          <h2>${escapeHTML(chapter.title)}</h2>
          <p class="chapter-heading__meta">${escapeHTML(chapter.years || chapter.dates || "")}${chapter.eyebrow ? ` · ${escapeHTML(chapter.eyebrow)}` : ""}</p>
        </div>
      </div>`;
  }

  function renderArtifactButtons(artifacts = []) {
    return artifacts.map((artifact) => {
      if (artifact.type === "page") {
        return `<a class="text-action" href="${escapeHTML(artifact.href)}" target="_blank" rel="noreferrer"><span>${escapeHTML(artifact.label)}</span><span aria-hidden="true">↗</span></a>`;
      }
      return `<button class="text-action" type="button" data-artifact-id="${escapeHTML(artifact.id)}"><span>${escapeHTML(artifact.label)}</span><span aria-hidden="true">+</span></button>`;
    }).join("");
  }

  function renderCapabilities() {
    const skills = state.content.skills || {};
    const awards = state.content.awards || [];
    const resumePDF = state.content.resume.pdf;
    const m = state.content.masthead;
    const row = (label, items = []) => `
      <div class="skill-row">
        <h3>${escapeHTML(label)}</h3>
        <p>${items.map((item) => escapeHTML(item)).join(" · ")}</p>
      </div>`;

    $("#capabilities").innerHTML = `
      <div class="reference-body">
        <div class="reveal">
          <h2 id="capabilitiesTitle">Skills and awards</h2>
        </div>
        <div class="skill-rows reveal">
          ${row("Programming", skills.programming)}
          ${row("Tools", skills.tools)}
          ${row("Methods", skills.methods)}
        </div>
        <div class="awards-block reveal">
          <p class="section-label">Awards</p>
          <ul class="plain-list">${awards.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
        </div>
        <div class="closing-strip reveal">
          <div class="closing-strip__contact">
            <span>${escapeHTML(m.location)}</span>
            <a href="mailto:${escapeHTML(m.email)}">${escapeHTML(m.email)}</a>
            <a href="${escapeHTML(m.linkedin)}" target="_blank" rel="noreferrer">LinkedIn</a>
            <a href="${escapeHTML(m.github)}" target="_blank" rel="noreferrer">GitHub</a>
          </div>
          <div class="closing-strip__actions">
            <a class="text-action" href="#top"><span>Index</span><span aria-hidden="true">↑</span></a>
            <button class="text-action" type="button" data-open-materials aria-controls="materialsDrawer" aria-expanded="false"><span>Materials</span><span aria-hidden="true">+</span></button>
            <a class="chrome-button" href="${escapeHTML(resumePDF)}" download>Résumé PDF</a>
          </div>
        </div>
      </div>`;
  }

  function renderMaterials() {
    $("#materialsList").innerHTML = state.content.supplementary.map((item) => {
      if (item.type === "file") {
        return `<a class="material-button" href="${escapeHTML(item.href)}" download><span>${escapeHTML(item.label)}</span><span>↓</span></a>`;
      }
      if (item.type === "page") {
        return `<a class="material-button" href="${escapeHTML(item.href)}" target="_blank" rel="noreferrer"><span>${escapeHTML(item.label)}</span><span>↗</span></a>`;
      }
      return `<button class="material-button" type="button" data-artifact-id="${escapeHTML(item.id)}"><span>${escapeHTML(item.label)}</span><span>View</span></button>`;
    }).join("");
  }

  function renderFooter() {
    $("#siteFooter").innerHTML = `
      <span>Peter Petersen · ${new Date().getFullYear()}</span>
      <a href="#top">Index</a>`;
  }

  function wireUI() {
    const drawer = $("#materialsDrawer");
    const scrim = $("#drawerScrim");
    const openButtons = $$('[data-open-materials]');
    const closeButtons = $$('[data-close-materials]');
    const dialog = $("#artifactDialog");
    const header = $("#siteHeader");
    const indexToggle = $("[data-toggle-index]");
    const pageRegions = [header, $("#main"), $("#siteFooter")].filter(Boolean);

    const setIndexOpen = (open) => {
      header.dataset.indexOpen = String(open);
      indexToggle.setAttribute("aria-expanded", String(open));
    };

    const setPageInert = (inert) => {
      pageRegions.forEach((region) => { region.inert = inert; });
    };

    const focusableIn = (root) => $$('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', root)
      .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true" && element.offsetParent !== null);

    const openDrawer = () => {
      state.lastFocus = document.activeElement;
      setIndexOpen(false);
      document.body.classList.add("drawer-open");
      drawer.inert = false;
      drawer.setAttribute("aria-hidden", "false");
      scrim.hidden = false;
      setPageInert(true);
      openButtons.forEach((button) => button.setAttribute("aria-expanded", "true"));
      requestAnimationFrame(() => $("[data-close-materials]", drawer)?.focus());
    };

    const closeDrawer = ({ restoreFocus = true } = {}) => {
      document.body.classList.remove("drawer-open");
      drawer.setAttribute("aria-hidden", "true");
      drawer.inert = true;
      scrim.hidden = true;
      setPageInert(false);
      openButtons.forEach((button) => button.setAttribute("aria-expanded", "false"));
      if (restoreFocus) requestAnimationFrame(() => state.lastFocus?.focus?.());
    };

    setIndexOpen(false);
    drawer.inert = true;

    openButtons.forEach((button) => button.addEventListener("click", openDrawer));
    closeButtons.forEach((button) => button.addEventListener("click", () => closeDrawer()));
    scrim.addEventListener("click", () => closeDrawer());

    drawer.addEventListener("keydown", (event) => {
      if (event.key !== "Tab" || drawer.getAttribute("aria-hidden") === "true") return;
      const focusable = focusableIn(drawer);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    indexToggle.addEventListener("click", () => setIndexOpen(header.dataset.indexOpen !== "true"));
    $("#siteNav").addEventListener("click", (event) => {
      if (event.target.closest("a")) setIndexOpen(false);
    });
    document.addEventListener("click", (event) => {
      if (header.dataset.indexOpen === "true" && !header.contains(event.target)) setIndexOpen(false);
    });

    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-artifact-id]");
      if (!trigger) return;
      const artifact = state.artifacts.get(trigger.dataset.artifactId);
      if (!artifact) return;
      state.lastDialogFocus = drawer.contains(trigger) ? state.lastFocus : trigger;
      if (drawer.getAttribute("aria-hidden") === "false") closeDrawer({ restoreFocus: false });
      openArtifact(artifact);
    });

    $$('[data-close-dialog]').forEach((button) => button.addEventListener("click", () => dialog.close()));
    dialog.addEventListener("close", () => {
      requestAnimationFrame(() => state.lastDialogFocus?.focus?.());
    });
    dialog.addEventListener("click", (event) => {
      const rect = dialog.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) dialog.close();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (drawer.getAttribute("aria-hidden") === "false") closeDrawer();
      if (header.dataset.indexOpen === "true") {
        setIndexOpen(false);
        indexToggle.focus();
      }
    });
  }

  function openArtifact(artifact) {
    const dialog = $("#artifactDialog");
    const title = $("#artifactDialogTitle");
    const type = $("#artifactDialogType");
    const body = $("#artifactDialogBody");

    title.textContent = artifact.caption || artifact.label || "Artifact";
    type.textContent = "Artifact";

    if (artifact.type !== "image") return;
    body.innerHTML = `<img src="${escapeHTML(artifact.src)}" alt="${escapeHTML(artifact.alt || artifact.caption || artifact.label)}"><p class="dialog-caption">${escapeHTML(artifact.caption || "")}</p>`;
    if (typeof dialog.showModal === "function") dialog.showModal();
  }

  // The site is one landing page with hash-routed views: no hash shows the
  // landing (masthead + explore index), #<chapter-id> or #capabilities shows
  // that section alone. Deep links work because routing runs after render.
  function routeIds() {
    return [...renderableChapters().map((chapter) => chapter.id), "capabilities"];
  }

  function currentRoute() {
    const id = decodeURIComponent(window.location.hash.slice(1));
    return routeIds().includes(id) ? id : "home";
  }

  function applyRoute() {
    const route = currentRoute();
    $("#top").hidden = route !== "home";
    renderableChapters().forEach((chapter) => {
      const section = document.getElementById(chapter.id);
      if (section) section.hidden = route !== chapter.id;
    });
    $("#capabilities").hidden = route !== "capabilities";
    $$("#siteNav a").forEach((link) => {
      link.setAttribute("aria-current", String(link.getAttribute("href") === `#${route}`));
    });
    window.scrollTo(0, 0);
    // The scroll-triggered reveal is for the landing; a view opened by route
    // change shows immediately rather than fading in from blank.
    const active = document.getElementById(route === "home" ? "top" : route);
    if (active) {
      if (active.classList.contains("reveal")) active.classList.add("is-visible");
      $$(".reveal", active).forEach((element) => element.classList.add("is-visible"));
    }
    if (route !== "home") {
      const heading = $(`#${CSS.escape(route)} h2`);
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
      }
    }
  }

  function setupReveal() {
    const items = $$(".reveal");
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    items.forEach((item) => observer.observe(item));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
