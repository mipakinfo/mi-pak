(function () {
  "use strict";

  var SHEET_ID = "1w39TDBO3LJHq4AJHuKoF8ZgXjyY85eynVhOJbmdczrQ";

  // Apps Script Web App (Code.gs) — write endpoint for the Apple Notes /
  // Shortcuts integration. The site itself only reads via csvUrl() below;
  // this isn't called from here yet.
  var WEBAPP_URL =
    "https://script.google.com/macros/s/AKfycbyll9B8i6mEZE5PPDba2XDpxKNzBuGyJf9zlrzEROT4Oa6cNzHLGo5OFJuatH0-U4dEGA/exec";

  // Google Cloud Console -> APIs & Services -> Credentials -> Create
  // API key -> restrict it to the Drive API and to this site's HTTP
  // referrer. Only works for folders shared "Anyone with the link can
  // view" (key-only auth can't read private folders).
  var DRIVE_API_KEY = "AIzaSyBszJTY8uWCZrkHdbEjFksncR2IFo2bQ7Q";

  function csvUrl() {
    return "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:csv&gid=0";
  }

  // Minimal RFC4180-style CSV parser: handles quoted fields, escaped
  // quotes ("") and commas/newlines inside quoted fields. (Same logic as
  // js/info.js — kept local since these pages don't share a build step.)
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

  function fetchEntries() {
    return fetch(csvUrl())
      .then(function (res) {
        if (!res.ok) throw new Error("Could not load the blog sheet");
        return res.text();
      })
      .then(parseCsv)
      .then(function (rows) {
        // header row is Date, Author, Title, Body, Image Path
        return rows.slice(1).filter(function (row) {
          return row.some(function (cell) {
            return cell;
          });
        });
      })
      .then(function (rows) {
        return rows
          .map(function (row) {
            return {
              date: row[0] || "",
              author: row[1] || "",
              title: row[2] || "",
              body: row[3] || "",
              imagePath: row[4] || "",
              number: entryNumber(row[2] || ""),
            };
          })
          .sort(function (a, b) {
            return parseDate(b.date) - parseDate(a.date);
          });
      });
  }

  function parseDate(str) {
    // sheet dates look like "2022/4/12"
    var parts = str.split("/").map(Number);
    if (parts.length !== 3) return 0;
    return new Date(parts[0], parts[1] - 1, parts[2]).getTime();
  }

  function entryNumber(title) {
    var match = title.match(/#(\d+)/);
    return match ? match[1] : null;
  }

  // Image Path is usually a Google Drive *folder* link (not a direct
  // image file), so it can't be used as an <img src> as-is. Only treat
  // it as a thumbnail source directly when it actually looks like a
  // direct image file — otherwise fall back to fetchFolderThumbnail().
  function directImageUrl(path) {
    if (!path) return null;
    return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(path) ? path : null;
  }

  function driveFolderId(path) {
    var match = (path || "").match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  // Lists the image files inside a public Drive folder via the Drive
  // API. Requires DRIVE_API_KEY and the folder to be shared "Anyone with
  // the link can view".
  function fetchFolderImages(folderId, pageSize) {
    if (!DRIVE_API_KEY || !folderId) return Promise.resolve([]);

    var query = "'" + folderId + "' in parents and mimeType contains 'image/' and trashed = false";
    var url =
      "https://www.googleapis.com/drive/v3/files" +
      "?q=" +
      encodeURIComponent(query) +
      "&fields=" +
      encodeURIComponent("files(id)") +
      "&orderBy=name" +
      "&pageSize=" +
      (pageSize || 1) +
      "&key=" +
      DRIVE_API_KEY;

    return fetch(url)
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (json) {
        return (json && json.files) || [];
      })
      .catch(function () {
        return [];
      });
  }

  function driveThumbnailUrl(fileId, width) {
    return "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w" + width;
  }

  // Just the first image, as a thumbnail — used for the grid card cover.
  function fetchFolderThumbnail(folderId) {
    return fetchFolderImages(folderId, 1).then(function (files) {
      return files[0] ? driveThumbnailUrl(files[0].id, 400) : null;
    });
  }

  // ------------------------------------------------------------------
  // List page (blog.html)
  // ------------------------------------------------------------------
  function renderList() {
    var grid = document.getElementById("blog-grid");
    if (!grid) return;

    fetchEntries()
      .then(function (entries) {
        grid.innerHTML = "";

        if (entries.length === 0) {
          grid.innerHTML = "<p>No entries yet.</p>";
          return;
        }

        entries.forEach(function (entry) {
          var card = document.createElement("a");
          card.className = "blog-card";
          card.href =
            "/html/blog-entry.html?entry=" + encodeURIComponent(entry.number || entry.title);

          var thumb = document.createElement("div");
          thumb.className = "blog-card__thumb";
          var imageUrl = directImageUrl(entry.imagePath);
          if (imageUrl) {
            thumb.style.backgroundImage = "url('" + imageUrl + "')";
          } else {
            var folderId = driveFolderId(entry.imagePath);
            if (folderId) {
              fetchFolderThumbnail(folderId).then(function (thumbUrl) {
                if (thumbUrl) thumb.style.backgroundImage = "url('" + thumbUrl + "')";
              });
            }
          }
          card.appendChild(thumb);

          var dateEl = document.createElement("span");
          dateEl.className = "blog-card__date";
          dateEl.textContent = entry.date;
          card.appendChild(dateEl);

          var titleEl = document.createElement("span");
          titleEl.className = "blog-card__title";
          titleEl.textContent = entry.title;
          card.appendChild(titleEl);

          grid.appendChild(card);
        });
      })
      .catch(function (err) {
        console.error(err);
        grid.innerHTML = "<p>Could not load the blog.</p>";
      });
  }

  function photoImg(src) {
    var img = document.createElement("img");
    img.src = src;
    img.loading = "lazy";
    img.className = "blog-entry__photo";
    return img;
  }

  // ------------------------------------------------------------------
  // Entry page (blog-entry.html)
  // ------------------------------------------------------------------
  function renderEntry() {
    var el = document.getElementById("blog-entry");
    if (!el) return;

    var params = new URLSearchParams(window.location.search);
    var wanted = params.get("entry") || "";

    fetchEntries()
      .then(function (entries) {
        var entry = entries.find(function (e) {
          return e.number === wanted || e.title.toLowerCase() === wanted.toLowerCase();
        });

        if (!entry) {
          el.innerHTML = "<p>Entry not found.</p>";
          return;
        }

        document.title = entry.title + " — Mi Pak";

        el.innerHTML = "";

        var h1 = document.createElement("h1");
        h1.textContent = entry.title;
        el.appendChild(h1);

        var dateEl = document.createElement("p");
        dateEl.className = "blog-entry__date";
        dateEl.textContent = entry.date;
        el.appendChild(dateEl);

        if (entry.author) {
          var authorEl = document.createElement("p");
          authorEl.className = "blog-entry__date";
          authorEl.textContent = entry.author;
          el.appendChild(authorEl);
        }

        entry.body.split(/\n+/).forEach(function (para) {
          if (!para.trim()) return;
          var p = document.createElement("p");
          p.textContent = para;
          el.appendChild(p);
        });

        if (entry.imagePath) {
          var gallery = document.createElement("div");
          gallery.className = "blog-entry__photos";
          el.appendChild(gallery);

          var directUrl = directImageUrl(entry.imagePath);
          if (directUrl) {
            gallery.appendChild(photoImg(directUrl));
          } else {
            var folderId = driveFolderId(entry.imagePath);
            if (folderId) {
              fetchFolderImages(folderId, 50).then(function (files) {
                files.forEach(function (file) {
                  gallery.appendChild(photoImg(driveThumbnailUrl(file.id, 1600)));
                });
              });
            }
          }
        }

        el.appendChild(entryNav(entries, entry));
      })
      .catch(function (err) {
        console.error(err);
        el.innerHTML = "<p>Could not load this entry.</p>";
      });
  }

  // Prev/next by entry number (older = number - 1, newer = number + 1),
  // not by list order, so it stays correct regardless of sort/filters.
  function entryNav(entries, current) {
    var nav = document.createElement("div");
    nav.className = "blog-entry__nav";

    if (current.number == null) return nav;

    var prevEntry = entries.find(function (e) {
      return e.number === String(Number(current.number) - 1);
    });
    var nextEntry = entries.find(function (e) {
      return e.number === String(Number(current.number) + 1);
    });

    var listLink = document.createElement("a");
    listLink.className = "blog-entry__nav-link blog-entry__nav-link--list";
    listLink.href = "/html/blog.html";
    listLink.textContent = "All Entries";

    nav.appendChild(navLink(prevEntry, "← " + (prevEntry ? prevEntry.title : "Prev")));
    nav.appendChild(listLink);
    nav.appendChild(navLink(nextEntry, (nextEntry ? nextEntry.title : "Next") + " →"));

    return nav;
  }

  function navLink(entry, label) {
    if (!entry) {
      var span = document.createElement("span");
      span.className = "blog-entry__nav-link blog-entry__nav-link--disabled";
      span.textContent = label;
      return span;
    }
    var a = document.createElement("a");
    a.className = "blog-entry__nav-link";
    a.href = "/html/blog-entry.html?entry=" + encodeURIComponent(entry.number || entry.title);
    a.textContent = label;
    return a;
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderList();
    renderEntry();
  });
})();
