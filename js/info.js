(function () {
  "use strict";

  var SHEET_ID = "1ydrmumCPvUyI-1QEPu3VxqXjHNeQV9U8_4h2lDlt0NU";

  function csvUrl(sheetName) {
    return (
      "https://docs.google.com/spreadsheets/d/" +
      SHEET_ID +
      "/gviz/tq?tqx=out:csv&sheet=" +
      encodeURIComponent(sheetName)
    );
  }

  // Minimal RFC4126/4180-style CSV parser: handles quoted fields, escaped
  // quotes ("") and commas/newlines inside quoted fields.
  function parseCsv(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\r") {
        // skip, \n handles the line break
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }

    // last field/row (files not ending on a newline)
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows.map(function (r) {
      return r.map(function (cell) {
        return (cell || "").trim();
      });
    });
  }

  function fetchSheet(sheetName) {
    return fetch(csvUrl(sheetName))
      .then(function (res) {
        if (!res.ok) {
          throw new Error("Could not load sheet: " + sheetName);
        }
        return res.text();
      })
      .then(parseCsv);
  }

  var HANGUL = /[ㄱ-ㆎ가-힣]/;

  function isDataRow(row) {
    var filled = row.filter(function (c) {
      return c.length > 0;
    });
    // Section title rows and "add a recent entry" placeholder rows only
    // ever have a single populated cell — real CV entries always have
    // more (at minimum a year and a citation string).
    return filled.length >= 2;
  }

  function isKorean(row) {
    return row.some(function (cell) {
      return HANGUL.test(cell);
    });
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // The last cell's citation line often repeats the row's year at the
  // end (e.g. "..., Seoul, 2024") since it's written as a standalone
  // citation. The year is already shown in its own column, so strip a
  // trailing copy (plus any leading comma/space) to avoid the dupe.
  function stripTrailingYear(citation, year) {
    if (!year) return citation;
    var pattern = new RegExp("[,\\s]*" + escapeRegExp(year) + "\\s*$");
    return citation.replace(pattern, "").trim();
  }

  var URL_PATTERN = /^https?:\/\//i;

  // Sheets differ in how much of the citation is pre-written:
  //  - Some rows have a genuine standalone citation as their last cell
  //    (it repeats earlier fields, e.g. "Title, Venue, City, 2024").
  //  - Most rows are just separate fields (title / venue / city /
  //    country) with nothing pre-joined.
  //  - Education/Awards additionally carry a link-to-source cell (school
  //    or award homepage) among the fields.
  // This pulls the URL out (wherever it is) and, if the last field looks
  // like a pre-written citation (it contains an earlier field as a
  // substring), uses it as-is; otherwise it builds the citation itself
  // by joining every remaining field.
  // A lone dash/em-dash is how the sheet marks an intentionally empty
  // field — drop it rather than joining it into the citation text.
  var EMPTY_PLACEHOLDER = /^[-—]$/;

  function extractUrlAndCitation(row) {
    var url = "";
    var fields = [];
    for (var i = 1; i < row.length; i++) {
      var cell = row[i] || "";
      if (!cell || EMPTY_PLACEHOLDER.test(cell)) continue;
      if (!url && URL_PATTERN.test(cell)) {
        url = cell;
        continue;
      }
      fields.push(cell);
    }

    var last = fields[fields.length - 1] || "";
    var earlier = fields.slice(0, -1);
    var isPrewritten = earlier.some(function (field) {
      return last.indexOf(field) !== -1;
    });

    var citation = isPrewritten ? last : fields.join(", ");
    return { url: url, citation: citation };
  }

  // For every CV-style tab (everything except "About"), each row's last
  // populated cell is already a fully formatted citation line, and the
  // first cell is the year. Rendering just those two keeps this in sync
  // with however many columns a given section happens to use.
  function renderList(listId, rows, lang) {
    var el = document.getElementById(listId);
    if (!el) return;

    var dataRows = rows.filter(isDataRow);
    var wanted = dataRows.filter(function (row) {
      return lang === "ko" ? isKorean(row) : !isKorean(row);
    });

    el.innerHTML = "";

    if (wanted.length === 0) {
      var empty = document.createElement("li");
      empty.className = "cv-item cv-item--empty";
      empty.textContent = lang === "ko" ? "등록된 내용이 없습니다." : "Nothing listed yet.";
      el.appendChild(empty);
      return;
    }

    wanted.forEach(function (row) {
      var year = row[0] || "";
      var extracted = extractUrlAndCitation(row);
      var citation = stripTrailingYear(extracted.citation, year);

      var li = document.createElement("li");
      li.className = "cv-item";

      var yearEl = document.createElement("span");
      yearEl.className = "cv-item__year";
      yearEl.textContent = year;

      var textEl;
      if (extracted.url) {
        textEl = document.createElement("a");
        textEl.href = extracted.url;
        textEl.target = "_blank";
        textEl.rel = "noopener noreferrer";
      } else {
        textEl = document.createElement("span");
      }
      textEl.className = "cv-item__text";
      textEl.textContent = citation;

      li.appendChild(yearEl);
      li.appendChild(textEl);
      el.appendChild(li);
    });
  }

  function findRow(rows, label) {
    return rows.find(function (row) {
      return (row[0] || "").indexOf(label) === 0;
    });
  }

  function renderAbout(rows) {
    var contactEl = document.getElementById("about-contact");
    var bioEl = document.getElementById("about-bio");
    var statementEl = document.getElementById("about-statement");

    var website = findRow(rows, "Website");
    var email = findRow(rows, "Personal Mail");
    var instagram = findRow(rows, "Instagram");

    contactEl.innerHTML = "";
    [
      { label: "Website", row: website },
      { label: "Email", row: email },
      { label: "Instagram", row: instagram },
    ].forEach(function (item) {
      if (!item.row) return;
      var value = item.row[2] || item.row[1] || "";
      if (!value) return;
      var p = document.createElement("p");
      p.className = "info-contact__line";
      p.textContent = item.label + ": " + value;
      contactEl.appendChild(p);
    });

    // EN: formal, 4-line bio. KR: 공식, 5줄 소개.
    var bioEn = findRow(rows, "BIO (formal, 4-lines)");
    var bioKo = findRow(rows, "소개 (공식, 5줄)");
    var statementKo = findRow(rows, "작가노트");

    window.__infoAbout = {
      bioEn: bioEn ? bioEn[bioEn.length - 1] : "",
      bioKo: bioKo ? bioKo[bioKo.length - 1] : "",
      statementKo: statementKo ? statementKo[statementKo.length - 1] : "",
    };

    applyAboutLanguage(currentLang());
  }

  function applyAboutLanguage(lang) {
    var data = window.__infoAbout;
    var bioEl = document.getElementById("about-bio");
    var statementEl = document.getElementById("about-statement");
    if (!data || !bioEl || !statementEl) return;

    bioEl.innerHTML = "";
    var bioText = lang === "ko" ? data.bioKo : data.bioEn;
    if (bioText) {
      var p = document.createElement("p");
      p.textContent = bioText;
      bioEl.appendChild(p);
    }

    statementEl.innerHTML = "";
    // an English artist statement isn't in the sheet yet — only shown for KR.
    if (lang === "ko" && data.statementKo) {
      var sp = document.createElement("p");
      sp.textContent = data.statementKo;
      statementEl.appendChild(sp);
    }
  }

  var SECTIONS = [
    { sheet: "About", listId: null, isAbout: true },
    { sheet: "Education", listId: "list-education" },
    { sheet: "Solo Exhibitions", listId: "list-solo-exhibitions" },
    { sheet: "Group Exhibitions", listId: "list-group-exhibitions" },
    { sheet: "Residiencies", listId: "list-residencies" },
    { sheet: "Commissions", listId: "list-commissions" },
    { sheet: "Presentations", listId: "list-presentations" },
    { sheet: "Project Involvements", listId: "list-project-involvements" },
    { sheet: "Awards", listId: "list-awards" },
  ];

  var sheetCache = {};

  function loadAllSheets() {
    return Promise.all(
      SECTIONS.map(function (section) {
        return fetchSheet(section.sheet)
          .then(function (rows) {
            sheetCache[section.sheet] = rows;
            if (section.isAbout) {
              renderAbout(rows);
            } else {
              renderList(section.listId, rows, currentLang());
            }
          })
          .catch(function (err) {
            console.error(err);
            if (section.listId) {
              var el = document.getElementById(section.listId);
              if (el) {
                el.innerHTML =
                  '<li class="cv-item cv-item--error">Could not load this section.</li>';
              }
            }
          });
      }),
    );
  }

  function rerenderAllLanguage(lang) {
    SECTIONS.forEach(function (section) {
      var rows = sheetCache[section.sheet];
      if (!rows) return;
      if (section.isAbout) {
        applyAboutLanguage(lang);
      } else {
        renderList(section.listId, rows, lang);
      }
    });

    document.querySelectorAll("[data-en][data-ko]").forEach(function (el) {
      el.textContent =
        lang === "ko" ? el.getAttribute("data-ko") : el.getAttribute("data-en");
    });

    document.documentElement.setAttribute("lang", lang === "ko" ? "ko" : "en");
  }

  function currentLang() {
    var toggle = document.getElementById("lang-toggle");
    return toggle ? toggle.getAttribute("data-lang") : "en";
  }

  function setupLangToggle() {
    var toggle = document.getElementById("lang-toggle");
    if (!toggle) return;
    toggle.addEventListener("click", function () {
      var next = currentLang() === "ko" ? "en" : "ko";
      toggle.setAttribute("data-lang", next);
      rerenderAllLanguage(next);
    });
  }

  // Scroll-spy: mark the sub-nav link for whichever section is in view.
  function setupScrollSpy() {
    var links = document.querySelectorAll("#info-subnav a");
    if (!("IntersectionObserver" in window) || links.length === 0) return;

    var linkByHash = {};
    links.forEach(function (link) {
      linkByHash[link.getAttribute("href")] = link;
    });

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var link = linkByHash["#" + entry.target.id];
          if (!link) return;
          if (entry.isIntersecting) {
            links.forEach(function (l) {
              l.removeAttribute("aria-current");
            });
            link.setAttribute("aria-current", "true");
          }
        });
      },
      { rootMargin: "-40% 0px -50% 0px" },
    );

    document.querySelectorAll(".info-section").forEach(function (section) {
      observer.observe(section);
    });
  }

  // NE-pointing arrow — sits right next to each section heading as the
  // "copy this section's text" affordance.
  var COPY_ICON_SVG =
    '<svg viewBox="0 0 16 16" width="12" height="12" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 12L12 4M6 4H12V10" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="butt" stroke-linejoin="miter"></path>' +
    "</svg>";

  // Adds a small copy-arrow icon right next to every .info-section's
  // heading. Click copies the section's rendered text (minus the button
  // itself) to the clipboard.
  function setupCopyButtons() {
    document.querySelectorAll(".info-section").forEach(function (section) {
      if (section.querySelector(".info-section__copy-btn")) return;

      var heading = section.querySelector("h2");
      if (!heading) return;

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "info-section__copy-btn";
      btn.setAttribute("aria-label", "Copy section text");
      btn.title = "Copy";
      btn.innerHTML = COPY_ICON_SVG;

      btn.addEventListener("click", function () {
        var text = section.innerText || section.textContent || "";
        navigator.clipboard.writeText(text.trim()).then(function () {
          btn.classList.add("info-section__copy-btn--done");
          setTimeout(function () {
            btn.classList.remove("info-section__copy-btn--done");
          }, 1200);
        });
      });

      heading.appendChild(btn);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    setupLangToggle();
    setupScrollSpy();
    setupCopyButtons();
    loadAllSheets();
  });
})();
