(() => {
  "use strict";

  const BOOKS_KEY = "rd_books_v2";
  const GOALS_KEY = "rd_goals_v2";

  const DB_NAME = "readingDepartmentDB";
  const DB_VERSION = 1;
  const COVER_STORE = "covers";

  const CURRENT_YEAR = new Date().getFullYear();

  const MONTHS = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC"
  ];

  let coverDBPromise = null;

  let pendingCoverBlob = null;

  let editingBookId = null;

  let selectedGoalYear = CURRENT_YEAR;


  const $ = (
    selector,
    root = document
  ) => root.querySelector(selector);


  const $$ = (
    selector,
    root = document
  ) => [...root.querySelectorAll(selector)];


  function uid() {

    return (
      crypto.randomUUID &&
      crypto.randomUUID()
    ) ||
    `bk-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  }


  /* ========================================
     LOCAL STORAGE
  ======================================== */

  function loadBooks() {

    try {

      return (
        JSON.parse(
          localStorage.getItem(
            BOOKS_KEY
          )
        ) || []
      );

    }

    catch {

      return [];

    }

  }


  function saveBooks(books) {

    localStorage.setItem(
      BOOKS_KEY,
      JSON.stringify(books)
    );

  }


  function loadGoals() {

    try {

      return (
        JSON.parse(
          localStorage.getItem(
            GOALS_KEY
          )
        ) || {}
      );

    }

    catch {

      return {};

    }

  }


  function saveGoals(goals) {

    localStorage.setItem(
      GOALS_KEY,
      JSON.stringify(goals)
    );

  }


  /* ========================================
     FORMATTING
  ======================================== */

  function formatNumber(value) {

    return Number(
      value || 0
    ).toLocaleString();

  }


  function formatDate(value) {

    if (!value) {
      return "—";
    }


    const date =
      new Date(
        `${value}T12:00:00`
      );


    if (
      Number.isNaN(
        date.getTime()
      )
    ) {

      return "—";

    }


    return date
      .toLocaleDateString(
        "en-US",
        {
          day: "2-digit",
          month: "short",
          year: "numeric"
        }
      )
      .toUpperCase();

  }


  function escapeHTML(
    value = ""
  ) {

    return String(value)

      .replaceAll(
        "&",
        "&amp;"
      )

      .replaceAll(
        "<",
        "&lt;"
      )

      .replaceAll(
        ">",
        "&gt;"
      )

      .replaceAll(
        '"',
        "&quot;"
      )

      .replaceAll(
        "'",
        "&#039;"
      );

  }


  function yearCode(year) {

    return String(year)
      .slice(-3)
      .padStart(
        3,
        "0"
      );

  }


  /* ========================================
     YEARS
  ======================================== */

  function bookYear(book) {

    if (
      book.finishDate
    ) {

      return Number(
        book.finishDate
          .slice(
            0,
            4
          )
      );

    }


    if (
      book.startDate
    ) {

      return Number(
        book.startDate
          .slice(
            0,
            4
          )
      );

    }


    return (
      Number(
        book.year
      ) ||

      new Date(
        book.createdAt ||
        Date.now()
      ).getFullYear()
    );

  }


  function finishedInYear(
    book,
    year
  ) {

    return (
      book.status ===
        "finished" &&

      book.finishDate &&

      Number(
        book.finishDate
          .slice(
            0,
            4
          )
      ) === Number(year)
    );

  }


  function yearList() {

    const years =
      new Set([
        CURRENT_YEAR
      ]);


    loadBooks()
      .forEach(
        book =>
          years.add(
            bookYear(book)
          )
      );


    Object.keys(
      loadGoals()
    )
      .forEach(
        year =>
          years.add(
            Number(year)
          )
      );


    return [
      ...years
    ]
      .filter(Boolean)
      .sort(
        (a, b) =>
          b - a
      );

  }


  function dateValue(book) {

    return (
      book.finishDate ||
      book.startDate ||
      String(
        book.createdAt ||
        ""
      ).slice(
        0,
        10
      ) ||
      ""
    );

  }


  function numberWithinYear(book) {

    const year =
      bookYear(book);


    const books =
      loadBooks()

        .filter(
          b =>
            bookYear(b) ===
            year
        )

        .slice()

        .sort(
          (a, b) =>

            dateValue(a)
              .localeCompare(
                dateValue(b)
              ) ||

            String(
              a.createdAt ||
              ""
            ).localeCompare(
              String(
                b.createdAt ||
                ""
              )
            )
        );


    const index =
      books.findIndex(
        b =>
          b.id ===
          book.id
      );


    return String(
      Math.max(
        index + 1,
        1
      )
    ).padStart(
      3,
      "0"
    );

  }


  function yearlyStats(year) {

    const books =
      loadBooks();


    const finished =
      books.filter(
        book =>
          finishedInYear(
            book,
            year
          )
      );


    const pages =
      finished.reduce(
        (
          sum,
          book
        ) =>

          sum +
          Number(
            book.pages ||
            0
          ),

        0
      );


    return {

      books,

      finished,

      pages,

      average:
        finished.length

          ? Math.round(
              pages /
              finished.length
            )

          : 0

    };

  }


  /* ========================================
     INDEXED DB
  ======================================== */

  function openCoverDB() {

    if (
      coverDBPromise
    ) {

      return coverDBPromise;

    }


    coverDBPromise =
      new Promise(
        (
          resolve,
          reject
        ) => {

          const request =
            indexedDB.open(
              DB_NAME,
              DB_VERSION
            );


          request.onupgradeneeded =
            () => {

              const db =
                request.result;


              if (
                !db.objectStoreNames
                  .contains(
                    COVER_STORE
                  )
              ) {

                db.createObjectStore(
                  COVER_STORE
                );

              }

            };


          request.onsuccess =
            () =>
              resolve(
                request.result
              );


          request.onerror =
            () =>
              reject(
                request.error
              );

        }
      );


    return coverDBPromise;

  }


  async function setCover(
    id,
    blob
  ) {

    const db =
      await openCoverDB();


    return new Promise(
      (
        resolve,
        reject
      ) => {

        const transaction =
          db.transaction(
            COVER_STORE,
            "readwrite"
          );


        transaction
          .objectStore(
            COVER_STORE
          )
          .put(
            blob,
            id
          );


        transaction.oncomplete =
          resolve;


        transaction.onerror =
          () =>
            reject(
              transaction.error
            );

      }
    );

  }


  async function getCover(id) {

    if (!id) {
      return null;
    }


    const db =
      await openCoverDB();


    return new Promise(
      (
        resolve,
        reject
      ) => {

        const transaction =
          db.transaction(
            COVER_STORE,
            "readonly"
          );


        const request =
          transaction
            .objectStore(
              COVER_STORE
            )
            .get(id);


        request.onsuccess =
          () =>
            resolve(
              request.result ||
              null
            );


        request.onerror =
          () =>
            reject(
              request.error
            );

      }
    );

  }


  async function deleteCover(id) {

    if (!id) {
      return;
    }


    const db =
      await openCoverDB();


    return new Promise(
      (
        resolve,
        reject
      ) => {

        const transaction =
          db.transaction(
            COVER_STORE,
            "readwrite"
          );


        transaction
          .objectStore(
            COVER_STORE
          )
          .delete(id);


        transaction.oncomplete =
          resolve;


        transaction.onerror =
          () =>
            reject(
              transaction.error
            );

      }
    );

  }


  async function clearCovers() {

    const db =
      await openCoverDB();


    return new Promise(
      (
        resolve,
        reject
      ) => {

        const transaction =
          db.transaction(
            COVER_STORE,
            "readwrite"
          );


        transaction
          .objectStore(
            COVER_STORE
          )
          .clear();


        transaction.oncomplete =
          resolve;


        transaction.onerror =
          () =>
            reject(
              transaction.error
            );

      }
    );

  }


  async function allCovers() {

    const db =
      await openCoverDB();


    return new Promise(
      (
        resolve,
        reject
      ) => {

        const transaction =
          db.transaction(
            COVER_STORE,
            "readonly"
          );


        const store =
          transaction.objectStore(
            COVER_STORE
          );


        const keysRequest =
          store.getAllKeys();


        const valuesRequest =
          store.getAll();


        transaction.oncomplete =
          () => {

            const result = {};


            (
              keysRequest.result ||
              []
            )
              .forEach(
                (
                  key,
                  index
                ) => {

                  result[key] =
                    valuesRequest
                      .result[index];

                }
              );


            resolve(result);

          };


        transaction.onerror =
          () =>
            reject(
              transaction.error
            );

      }
    );

  }


  /* ========================================
     IMAGE UTILITIES
  ======================================== */

  function blobToDataURL(blob) {

    return new Promise(
      (
        resolve,
        reject
      ) => {

        const reader =
          new FileReader();


        reader.onload =
          () =>
            resolve(
              reader.result
            );


        reader.onerror =
          reject;


        reader.readAsDataURL(
          blob
        );

      }
    );

  }


  function dataURLToBlob(
    dataURL
  ) {

    const [
      meta,
      data
    ] =
      dataURL.split(",");


    const mime =
      (
        meta.match(
          /data:(.*?);/
        ) ||
        []
      )[1] ||
      "image/webp";


    const binary =
      atob(data);


    const bytes =
      new Uint8Array(
        binary.length
      );


    for (
      let i = 0;
      i < binary.length;
      i++
    ) {

      bytes[i] =
        binary.charCodeAt(i);

    }


    return new Blob(
      [bytes],
      {
        type: mime
      }
    );

  }


  function fileToImage(file) {

    return new Promise(
      (
        resolve,
        reject
      ) => {

        const image =
          new Image();


        const url =
          URL.createObjectURL(
            file
          );


        image.onload =
          () => {

            URL.revokeObjectURL(
              url
            );

            resolve(image);

          };


        image.onerror =
          error => {

            URL.revokeObjectURL(
              url
            );

            reject(error);

          };


        image.src =
          url;

      }
    );

  }


  async function optimizeCover(file) {

    const image =
      await fileToImage(
        file
      );


    const targetWidth =
      600;


    const targetHeight =
      900;


    const targetRatio =
      targetWidth /
      targetHeight;


    const sourceRatio =
      image.naturalWidth /
      image.naturalHeight;


    let sourceX = 0;

    let sourceY = 0;

    let sourceWidth =
      image.naturalWidth;

    let sourceHeight =
      image.naturalHeight;


    if (
      sourceRatio >
      targetRatio
    ) {

      sourceWidth =
        image.naturalHeight *
        targetRatio;


      sourceX =
        (
          image.naturalWidth -
          sourceWidth
        ) / 2;

    }

    else {

      sourceHeight =
        image.naturalWidth /
        targetRatio;


      sourceY =
        (
          image.naturalHeight -
          sourceHeight
        ) / 2;

    }


    const canvas =
      document.createElement(
        "canvas"
      );


    canvas.width =
      targetWidth;


    canvas.height =
      targetHeight;


    canvas
      .getContext(
        "2d"
      )
      .drawImage(

        image,

        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,

        0,
        0,
        targetWidth,
        targetHeight

      );


    return new Promise(
      resolve =>

        canvas.toBlob(
          resolve,
          "image/webp",
          0.84
        )

    );

  }


  async function setImageElement(
    imageElement,
    coverId,
    placeholderElement = null
  ) {

    if (
      !imageElement ||
      !coverId
    ) {

      return;

    }


    const blob =
      await getCover(
        coverId
      );


    if (!blob) {
      return;
    }


    const url =
      URL.createObjectURL(
        blob
      );


    imageElement.src =
      url;


    imageElement.hidden =
      false;


    if (
      placeholderElement
    ) {

      placeholderElement.hidden =
        true;

    }


    imageElement.onload =
      () =>
        URL.revokeObjectURL(
          url
        );

  }


  async function hydrateCovers(
    root = document
  ) {

    const books =
      new Map(

        loadBooks()
          .map(
            book => [
              book.id,
              book
            ]
          )

      );


    const images =
      $$(
        "[data-cover-for]",
        root
      );


    await Promise.all(

      images.map(
        async image => {

          const book =
            books.get(
              image.dataset.coverFor
            );


          if (
            !book?.coverId
          ) {

            return;

          }


          const placeholder =
            root.querySelector(
              `[data-placeholder-for="${book.id}"]`
            );


          await setImageElement(
            image,
            book.coverId,
            placeholder
          );

        }
      )

    );

  }


  /* ========================================
     GLOBAL CHROME
  ======================================== */

  function initChrome() {

    const page =
      document.body.dataset.page;


    $$(
      "[data-nav]"
    )
      .forEach(
        link =>

          link.classList
            .toggle(
              "active",
              link.dataset.nav ===
                page
            )

      );


    const today =
      $("#todayLabel");


    if (today) {

      today.textContent =
        new Date()
          .toLocaleDateString(
            "en-US",
            {
              month: "2-digit",
              day: "2-digit",
              year: "2-digit"
            }
          );

    }


    const yearsBox =
      $("#sidebarYears");


    if (
      yearsBox
    ) {

      yearsBox.innerHTML =
        yearList()
          .map(
            year =>

              `<a href="library.html?year=${year}">
                ${year}
              </a>`

          )
          .join("");

    }


    injectGlobalLayer();


    $$(
      "[data-open-add]"
    )
      .forEach(
        button =>

          button.addEventListener(
            "click",
            () =>
              openBookModal()
          )

      );


    $$(
      "[data-open-utility]"
    )
      .forEach(
        button =>

          button.addEventListener(
            "click",
            openUtilityModal
          )

      );

  }


  /* ========================================
     GLOBAL MODALS
  ======================================== */

  function injectGlobalLayer() {

    const host =
      $("#appLayer");


    if (!host) {
      return;
    }


    host.innerHTML = `

      <div
        id="bookModal"
        class="modal-backdrop hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bookModalTitle"
      >

        <div class="modal-panel">

          <div class="modal-header">

            <h2 id="bookModalTitle">
              ADD BOOK
            </h2>

            <button
              class="icon-button"
              type="button"
              data-close-book
              aria-label="Close"
            >
              ×
            </button>

          </div>


          <form
            id="bookForm"
            class="book-form"
          >

            <div class="cover-upload-area">

              <div class="cover-preview">

                <span id="coverPreviewPlaceholder">
                  NO COVER
                </span>

                <img
                  id="coverPreviewImage"
                  alt="Selected book cover"
                  hidden
                >

              </div>


              <div class="cover-controls">

                <span class="cover-upload-label">
                  BOOK COVER
                </span>


                <label
                  id="coverDropZone"
                  class="drop-zone"
                >

                  DROP IMAGE HERE OR CLICK TO CHOOSE

                  <input
                    id="coverInput"
                    class="cover-file-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                  >

                </label>


                <p>
                  Images are automatically center-cropped
                  to 2:3 and saved as an optimized
                  600 × 900 WEBP.
                </p>

              </div>

            </div>


            <div class="form-grid">


              <label class="form-field full">

                <span>
                  TITLE *
                </span>

                <input
                  id="bookTitle"
                  required
                >

              </label>


              <label class="form-field full">

                <span>
                  AUTHOR *
                </span>

                <input
                  id="bookAuthor"
                  required
                >

              </label>


              <label class="form-field">

                <span>
                  GENRE
                </span>

                <input
                  id="bookGenre"
                  placeholder="FANTASY"
                >

              </label>


              <label class="form-field">

                <span>
                  PAGES
                </span>

                <input
                  id="bookPages"
                  type="number"
                  min="0"
                  step="1"
                >

              </label>


              <label class="form-field">

                <span>
                  STATUS
                </span>

                <select id="bookStatus">

                  <option value="want-to-read">
                    WANT TO READ
                  </option>

                  <option value="reading">
                    READING
                  </option>

                  <option value="finished">
                    FINISHED
                  </option>

                  <option value="dnf">
                    DID NOT FINISH
                  </option>

                </select>

              </label>


              <label class="form-field">

                <span>
                  FORMAT
                </span>

                <select id="bookFormat">

                  <option value="">
                    —
                  </option>

                  <option>
                    HARDCOVER
                  </option>

                  <option>
                    PAPERBACK
                  </option>

                  <option>
                    EBOOK
                  </option>

                  <option>
                    AUDIOBOOK
                  </option>

                  <option>
                    OTHER
                  </option>

                </select>

              </label>


              <label class="form-field">

                <span>
                  START DATE
                </span>

                <input
                  id="bookStartDate"
                  type="date"
                >

              </label>


              <label class="form-field">

                <span>
                  FINISH DATE
                </span>

                <input
                  id="bookFinishDate"
                  type="date"
                >

              </label>


              <label class="form-field full">

                <span>
                  SERIES
                </span>

                <input id="bookSeries">

              </label>


              <div class="form-field full">

                <span>
                  HOW WAS IT?
                </span>


                <div class="verdict-picker">


                  <label class="verdict-option">

                    <input
                      type="radio"
                      name="bookVerdict"
                      value=""
                    >

                    <span>
                      UNRATED
                    </span>

                  </label>


                  <label class="verdict-option">

                    <input
                      type="radio"
                      name="bookVerdict"
                      value="nah"
                    >

                    <span>
                      NAH
                    </span>

                  </label>


                  <label class="verdict-option">

                    <input
                      type="radio"
                      name="bookVerdict"
                      value="meh"
                    >

                    <span>
                      MEH
                    </span>

                  </label>


                  <label class="verdict-option">

                    <input
                      type="radio"
                      name="bookVerdict"
                      value="yah"
                    >

                    <span>
                      YAH
                    </span>

                  </label>


                </div>

              </div>


              <label class="checkbox-field full">

                <input
                  id="bookFavorite"
                  type="checkbox"
                >

                ALL-TIME FAVORITE

              </label>


              <label class="checkbox-field full">

                <input
                  id="bookReread"
                  type="checkbox"
                >

                RE-READ

              </label>


              <label class="form-field full">

                <span>
                  NOTES
                </span>

                <textarea
                  id="bookNotes"
                ></textarea>

              </label>

            </div>


            <div class="form-actions">

              <button
                class="button"
                type="button"
                data-close-book
              >
                CANCEL
              </button>

              <button
                class="button button-blue"
                type="submit"
              >
                SAVE BOOK
              </button>

            </div>

          </form>

        </div>

      </div>


      <div
        id="goalModal"
        class="modal-backdrop hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="goalModalTitle"
      >

        <div class="modal-panel">

          <div class="modal-header">

            <h2 id="goalModalTitle">
              EDIT GOALS
            </h2>

            <button
              class="icon-button"
              type="button"
              data-close-goal
              aria-label="Close"
            >
              ×
            </button>

          </div>


          <form
            id="goalForm"
            class="goal-form"
          >

            <label>

              <span>
                READING YEAR
              </span>

              <input
                id="goalFormYear"
                type="number"
                readonly
              >

            </label>


            <label>

              <span>
                BOOK GOAL
              </span>

              <input
                id="goalFormBooks"
                type="number"
                min="0"
                step="1"
                placeholder="40"
              >

            </label>


            <label>

              <span>
                PAGE GOAL
              </span>

              <input
                id="goalFormPages"
                type="number"
                min="0"
                step="1"
                placeholder="12000"
              >

            </label>


            <div class="form-actions">

              <button
                class="button"
                type="button"
                data-close-goal
              >
                CANCEL
              </button>

              <button
                class="button button-blue"
                type="submit"
              >
                SAVE GOALS
              </button>

            </div>

          </form>

        </div>

      </div>


      <div
        id="utilityModal"
        class="modal-backdrop hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="utilityModalTitle"
      >

        <div class="modal-panel">

          <div class="modal-header">

            <h2 id="utilityModalTitle">
              UTILITY
            </h2>

            <button
              class="icon-button"
              type="button"
              data-close-utility
              aria-label="Close"
            >
              ×
            </button>

          </div>


          <div class="utility-body">

            <h3>
              DATA
            </h3>


            <p>
              Your library currently lives in this browser.
              A backup lets you restore your books, goals,
              and uploaded covers if browser data is ever cleared.
            </p>


            <div class="utility-actions">

              <button
                id="exportJsonBtn"
                class="button button-blue"
                type="button"
              >
                EXPORT BACKUP + COVERS
              </button>


              <label class="button file-button">

                IMPORT BACKUP

                <input
                  id="importJsonInput"
                  type="file"
                  accept="application/json,.json"
                >

              </label>


              <button
                id="exportCsvBtn"
                class="button"
                type="button"
              >
                EXPORT CSV
              </button>

            </div>


            <div class="utility-note">
              BACKUP IS MAINTENANCE,
              NOT PART OF YOUR READING WORKFLOW.
            </div>


            <p
              id="dataStatus"
              class="save-status"
              role="status"
            ></p>

          </div>

        </div>

      </div>

    `;


    $$(
      "[data-close-book]"
    )
      .forEach(
        button =>

          button.addEventListener(
            "click",
            closeBookModal
          )

      );


    $$(
      "[data-close-goal]"
    )
      .forEach(
        button =>

          button.addEventListener(
            "click",
            closeGoalModal
          )

      );


    $$(
      "[data-close-utility]"
    )
      .forEach(
        button =>

          button.addEventListener(
            "click",
            closeUtilityModal
          )

      );


    $("#bookForm")
      .addEventListener(
        "submit",
        saveBookFromForm
      );


    $("#bookStatus")
      .addEventListener(
        "change",
        syncFinishDateWithStatus
      );


    $("#coverInput")
      .addEventListener(
        "change",
        handleCoverSelection
      );


    $("#goalForm")
      .addEventListener(
        "submit",
        saveGoalFromModal
      );


    $("#exportJsonBtn")
      .addEventListener(
        "click",
        exportJSON
      );


    $("#exportCsvBtn")
      .addEventListener(
        "click",
        exportCSV
      );


    $("#importJsonInput")
      .addEventListener(
        "change",
        importJSON
      );


    const dropZone =
      $("#coverDropZone");


    [
      "dragenter",
      "dragover"
    ]
      .forEach(
        eventType =>

          dropZone.addEventListener(
            eventType,
            event => {

              event.preventDefault();

              dropZone.classList
                .add(
                  "dragging"
                );

            }
          )

      );


    [
      "dragleave",
      "drop"
    ]
      .forEach(
        eventType =>

          dropZone.addEventListener(
            eventType,
            event => {

              event.preventDefault();

              dropZone.classList
                .remove(
                  "dragging"
                );

            }
          )

      );


    dropZone
      .addEventListener(
        "drop",
        async event => {

          const file =
            event
              .dataTransfer
              ?.files?.[0];


          if (file) {

            await processCoverFile(
              file
            );

          }

        }
      );


    $("#bookModal")
      .addEventListener(
        "click",
        event => {

          if (
            event.target.id ===
            "bookModal"
          ) {

            closeBookModal();

          }

        }
      );


    $("#goalModal")
      .addEventListener(
        "click",
        event => {

          if (
            event.target.id ===
            "goalModal"
          ) {

            closeGoalModal();

          }

        }
      );


    $("#utilityModal")
      .addEventListener(
        "click",
        event => {

          if (
            event.target.id ===
            "utilityModal"
          ) {

            closeUtilityModal();

          }

        }
      );

  }


  /* ========================================
     TOAST
  ======================================== */

  function toast(message) {

    $(".toast")
      ?.remove();


    const element =
      document.createElement(
        "div"
      );


    element.className =
      "toast";


    element.textContent =
      message;


    document.body
      .appendChild(
        element
      );


    setTimeout(
      () =>
        element.remove(),
      2400
    );

  }


  function lockBody(locked) {

    document.body.style.overflow =
      locked
        ? "hidden"
        : "";

  }


  /* ========================================
     COVER UPLOAD
  ======================================== */

  function syncFinishDateWithStatus() {

    if (
      $("#bookStatus").value ===
        "finished" &&

      !$("#bookFinishDate").value
    ) {

      $("#bookFinishDate").value =
        new Date()
          .toISOString()
          .slice(
            0,
            10
          );

    }

  }


  async function handleCoverSelection(
    event
  ) {

    const file =
      event.target
        .files?.[0];


    if (file) {

      await processCoverFile(
        file
      );

    }

  }


  async function processCoverFile(file) {

    if (
      !file.type
        .startsWith(
          "image/"
        )
    ) {

      return toast(
        "Please choose an image file."
      );

    }


    try {

      pendingCoverBlob =
        await optimizeCover(
          file
        );


      const image =
        $("#coverPreviewImage");


      const placeholder =
        $("#coverPreviewPlaceholder");


      const url =
        URL.createObjectURL(
          pendingCoverBlob
        );


      image.src =
        url;


      image.hidden =
        false;


      placeholder.hidden =
        true;


      image.onload =
        () =>
          URL.revokeObjectURL(
            url
          );

    }


    catch {

      toast(
        "Could not process that cover image."
      );

    }

  }


  /* ========================================
     BOOK MODAL
  ======================================== */

  async function openBookModal(
    book = null
  ) {

    editingBookId =
      book?.id ||
      null;


    pendingCoverBlob =
      null;


    $("#bookModalTitle")
      .textContent =
        book
          ? "EDIT BOOK"
          : "ADD BOOK";


    $("#bookForm")
      .reset();


    $(
      'input[name="bookVerdict"][value=""]'
    ).checked =
      true;


    $("#coverPreviewImage")
      .hidden =
        true;


    $("#coverPreviewImage")
      .removeAttribute(
        "src"
      );


    $("#coverPreviewPlaceholder")
      .hidden =
        false;


    if (book) {

      $("#bookTitle").value =
        book.title ||
        "";


      $("#bookAuthor").value =
        book.author ||
        "";


      $("#bookGenre").value =
        book.genre ||
        "";


      $("#bookPages").value =
        book.pages ||
        "";


      $("#bookStatus").value =
        book.status ||
        "want-to-read";


      $("#bookFormat").value =
        book.format ||
        "";


      $("#bookStartDate").value =
        book.startDate ||
        "";


      $("#bookFinishDate").value =
        book.finishDate ||
        "";


      $("#bookSeries").value =
        book.series ||
        "";


      $("#bookFavorite").checked =
        !!book.favorite;


      $("#bookReread").checked =
        !!book.reread;


      $("#bookNotes").value =
        book.notes ||
        "";


      const verdictRadio =
        $(
          `input[name="bookVerdict"][value="${book.verdict || ""}"]`
        );


      if (
        verdictRadio
      ) {

        verdictRadio.checked =
          true;

      }


      if (
        book.coverId
      ) {

        await setImageElement(

          $("#coverPreviewImage"),

          book.coverId,

          $("#coverPreviewPlaceholder")

        );

      }

    }


    $("#bookModal")
      .classList
      .remove(
        "hidden"
      );


    lockBody(true);


    setTimeout(
      () =>
        $("#bookTitle")
          ?.focus(),
      50
    );

  }


  function closeBookModal() {

    $("#bookModal")
      ?.classList
      .add(
        "hidden"
      );


    editingBookId =
      null;


    pendingCoverBlob =
      null;


    lockBody(false);

  }


  async function saveBookFromForm(
    event
  ) {

    event.preventDefault();


    const books =
      loadBooks();


    const oldBook =
      editingBookId

        ? books.find(
            book =>
              book.id ===
              editingBookId
          )

        : null;


    const id =
      oldBook?.id ||
      uid();


    const coverId =
      oldBook?.coverId ||
      `cover-${id}`;


    const status =
      $("#bookStatus").value;


    const verdict =
      $(
        'input[name="bookVerdict"]:checked'
      )?.value ||
      "";


    const book = {

      id,

      title:
        $("#bookTitle")
          .value
          .trim(),

      author:
        $("#bookAuthor")
          .value
          .trim(),

      genre:
        $("#bookGenre")
          .value
          .trim(),

      pages:
        Number(
          $("#bookPages")
            .value ||
          0
        ),

      status,

      format:
        $("#bookFormat")
          .value,

      startDate:
        $("#bookStartDate")
          .value,

      finishDate:
        $("#bookFinishDate")
          .value,

      series:
        $("#bookSeries")
          .value
          .trim(),

      verdict:
        status ===
          "finished"

          ? verdict

          : "",

      favorite:
        $("#bookFavorite")
          .checked,

      reread:
        $("#bookReread")
          .checked,

      notes:
        $("#bookNotes")
          .value
          .trim(),

      coverId:
        oldBook?.coverId ||

        (
          pendingCoverBlob
            ? coverId
            : ""
        ),

      createdAt:
        oldBook?.createdAt ||

        new Date()
          .toISOString(),

      updatedAt:
        new Date()
          .toISOString()

    };


    if (
      status ===
        "finished" &&

      !book.finishDate
    ) {

      toast(
        "Add a finish date so the book counts toward the correct year."
      );

      return;

    }


    if (
      pendingCoverBlob
    ) {

      await setCover(
        coverId,
        pendingCoverBlob
      );


      book.coverId =
        coverId;

    }


    const nextBooks =
      editingBookId

        ? books.map(
            old =>
              old.id ===
              editingBookId

                ? book
                : old
          )

        : [
            ...books,
            book
          ];


    saveBooks(
      nextBooks
    );


    const wasEditing =
      Boolean(
        editingBookId
      );


    closeBookModal();


    toast(
      wasEditing
        ? "Book updated."
        : "Book added."
    );


    setTimeout(
      () =>
        location.reload(),
      220
    );

  }


  /* ========================================
     UTILITY
  ======================================== */

  function openUtilityModal() {

    $("#utilityModal")
      .classList
      .remove(
        "hidden"
      );


    lockBody(true);

  }


  function closeUtilityModal() {

    $("#utilityModal")
      .classList
      .add(
        "hidden"
      );


    lockBody(false);

  }


  async function exportJSON() {

    const status =
      $("#dataStatus");


    status.textContent =
      "BUILDING BACKUP…";


    try {

      const covers =
        await allCovers();


      const encodedCovers =
        {};


      for (
        const [
          id,
          blob
        ]
        of
        Object.entries(
          covers
        )
      ) {

        encodedCovers[id] =
          await blobToDataURL(
            blob
          );

      }


      const payload = {

        app:
          "Reading Department",

        version:
          3,

        exportedAt:
          new Date()
            .toISOString(),

        books:
          loadBooks(),

        goals:
          loadGoals(),

        covers:
          encodedCovers

      };


      downloadFile(

        `reading-department-backup-${
          new Date()
            .toISOString()
            .slice(
              0,
              10
            )
        }.json`,

        JSON.stringify(
          payload,
          null,
          2
        ),

        "application/json"

      );


      status.textContent =
        "BACKUP EXPORTED.";

    }


    catch {

      status.textContent =
        "BACKUP FAILED.";

    }

  }


  function exportCSV() {

    const headers = [

      "Title",
      "Author",
      "Genre",
      "Pages",
      "Status",
      "Start Date",
      "Finish Date",
      "Verdict",
      "Favorite",
      "Re-read",
      "Format",
      "Series",
      "Notes"

    ];


    const rows =
      loadBooks()
        .map(
          book => [

            book.title,
            book.author,
            book.genre,
            book.pages,
            book.status,
            book.startDate,
            book.finishDate,
            book.verdict,
            book.favorite,
            book.reread,
            book.format,
            book.series,
            book.notes

          ]
        );


    const csv =
      [
        headers,
        ...rows
      ]
        .map(
          row =>
            row
              .map(
                csvCell
              )
              .join(",")
        )
        .join("\n");


    downloadFile(

      `reading-department-${
        new Date()
          .toISOString()
          .slice(
            0,
            10
          )
      }.csv`,

      csv,

      "text/csv"

    );


    $("#dataStatus")
      .textContent =
        "CSV EXPORTED.";

  }


  function csvCell(value) {

    return `"${

      String(
        value ??
        ""
      )
        .replaceAll(
          '"',
          '""'
        )

    }"`;

  }


  function downloadFile(
    name,
    content,
    type
  ) {

    const blob =
      new Blob(
        [content],
        {
          type
        }
      );


    const url =
      URL.createObjectURL(
        blob
      );


    const anchor =
      document.createElement(
        "a"
      );


    anchor.href =
      url;


    anchor.download =
      name;


    anchor.click();


    setTimeout(
      () =>
        URL.revokeObjectURL(
          url
        ),
      500
    );

  }


  async function importJSON(
    event
  ) {

    const file =
      event.target
        .files?.[0];


    if (!file) {
      return;
    }


    const status =
      $("#dataStatus");


    try {

      const payload =
        JSON.parse(
          await file.text()
        );


      if (
        !Array.isArray(
          payload.books
        ) ||

        typeof payload.goals !==
          "object"
      ) {

        throw new Error(
          "Invalid"
        );

      }


      saveBooks(
        payload.books
      );


      saveGoals(
        payload.goals ||
        {}
      );


      await clearCovers();


      for (
        const [
          id,
          dataURL
        ]
        of
        Object.entries(
          payload.covers ||
          {}
        )
      ) {

        await setCover(

          id,

          dataURLToBlob(
            dataURL
          )

        );

      }


      status.textContent =
        "BACKUP IMPORTED. RELOADING…";


      setTimeout(
        () =>
          location.reload(),
        700
      );

    }


    catch {

      status.textContent =
        "IMPORT FAILED — NOT A READING DEPARTMENT BACKUP.";

    }


    finally {

      event.target.value =
        "";

    }

  }


  /* ========================================
     GOAL MODAL
  ======================================== */

  function openGoalModal(
    year =
      selectedGoalYear
  ) {

    const goals =
      loadGoals()[year] ||
      {};


    $("#goalFormYear").value =
      year;


    $("#goalFormBooks").value =
      goals.bookGoal ||
      "";


    $("#goalFormPages").value =
      goals.pageGoal ||
      "";


    $("#goalModal")
      .classList
      .remove(
        "hidden"
      );


    lockBody(true);

  }


  function closeGoalModal() {

    $("#goalModal")
      .classList
      .add(
        "hidden"
      );


    lockBody(false);

  }


  function saveGoalFromModal(
    event
  ) {

    event.preventDefault();


    const year =
      Number(
        $("#goalFormYear")
          .value
      );


    const goals =
      loadGoals();


    goals[year] = {

      bookGoal:
        Number(
          $("#goalFormBooks")
            .value ||
          0
        ),

      pageGoal:
        Number(
          $("#goalFormPages")
            .value ||
          0
        )

    };


    saveGoals(
      goals
    );


    closeGoalModal();


    toast(
      `${year} goals saved.`
    );


    if (
      document.body
        .dataset.page ===
        "goals"
    ) {

      renderGoalsPage(
        year
      );

    }


    if (
      document.body
        .dataset.page ===
        "home"
    ) {

      renderHome(
        Number(
          $("#dashboardYear")
            .value
        )
      );

    }

  }


  /* ========================================
     BOOK CARD
  ======================================== */

  function bookCardHTML(book) {

    return `

      <a
        class="book-card"
        href="book.html?id=${encodeURIComponent(book.id)}"
      >

        <div class="book-cover-wrap">

          <span
            class="cover-placeholder"
            data-placeholder-for="${book.id}"
          >
            ${escapeHTML(book.title)}
          </span>

          <img
            class="book-cover"
            data-cover-for="${book.id}"
            alt="${escapeHTML(book.title)} cover"
            hidden
          >

        </div>


        <span class="book-card-number">

          ${numberWithinYear(book)}

          ${
            book.verdict
              ? ` / ${book.verdict.toUpperCase()}`
              : ""
          }

        </span>


        <h3>
          ${escapeHTML(book.title)}
        </h3>


        <p>
          ${escapeHTML(book.author)}
        </p>

      </a>
    `;

  }


  /* ========================================
     HOME
  ======================================== */

  function initHome() {

    const years =
      yearList();


    const select =
      $("#dashboardYear");


    select.innerHTML =
      years
        .map(
          year =>

            `<option value="${year}">
              ${year}
            </option>`

        )
        .join("");


    select.value =
      years.includes(
        CURRENT_YEAR
      )

        ? CURRENT_YEAR
        : years[0];


    select.addEventListener(
      "change",
      () =>
        renderHome(
          Number(
            select.value
          )
        )
    );


    renderHome(
      Number(
        select.value
      )
    );

  }


  async function renderHome(year) {

    const {
      books,
      finished,
      pages,
      average
    } =
      yearlyStats(year);


    $("#dashboardYearTitle")
      .textContent =
        year;


    $("#dashboardYearCode")
      .textContent =
        yearCode(year);


    $("#statBooks")
      .textContent =
        formatNumber(
          finished.length
        );


    $("#statPages")
      .textContent =
        formatNumber(
          pages
        );


    $("#statAverage")
      .textContent =
        formatNumber(
          average
        );


    $("#statReading")
      .textContent =
        formatNumber(

          books.filter(
            book =>
              book.status ===
              "reading"
          ).length

        );


    $("#editGoalsLink")
      .href =
        `goals.html?year=${year}`;


    const goals =
      loadGoals()[year] ||
      {
        bookGoal:
          0,

        pageGoal:
          0
      };


    setGoalUI(

      "book",

      finished.length,

      Number(
        goals.bookGoal ||
        0
      )

    );


    setGoalUI(

      "page",

      pages,

      Number(
        goals.pageGoal ||
        0
      )

    );


    renderVerdicts(
      finished
    );


    renderGenres(
      finished
    );


    renderMonths(
      finished
    );


    const reading =
      books

        .filter(
          book =>
            book.status ===
            "reading"
        )

        .slice(
          0,
          5
        );


    $("#currentlyReading")
      .innerHTML =

        reading.length

          ? reading
              .map(
                bookCardHTML
              )
              .join("")

          : `
              <p class="eyebrow">
                NO BOOKS CURRENTLY
                MARKED AS READING.
              </p>
            `;


    const recent =
      finished

        .slice()

        .sort(
          (a, b) =>

            String(
              b.finishDate
            ).localeCompare(
              String(
                a.finishDate
              )
            )

        )

        .slice(
          0,
          5
        );


    $("#recentBooks")
      .innerHTML =

        recent.length

          ? recent
              .map(
                bookCardHTML
              )
              .join("")

          : `
              <p class="eyebrow">
                NO FINISHED BOOKS
                IN ${year} YET.
              </p>
            `;


    await hydrateCovers(
      $("#currentlyReading")
    );


    await hydrateCovers(
      $("#recentBooks")
    );

  }


  function setGoalUI(
    type,
    current,
    target
  ) {

    const prefix =
      type ===
        "book"

        ? "book"
        : "page";


    const percent =
      target > 0

        ? Math.round(
            (
              current /
              target
            ) *
            1000
          ) / 10

        : 0;


    $(
      `#${prefix}GoalDisplay`
    )
      .textContent =
        `${
          formatNumber(
            current
          )
        } / ${
          target
            ? formatNumber(
                target
              )
            : "—"
        }`;


    $(
      `#${prefix}GoalBar`
    )
      .style.width =
        `${
          Math.min(
            percent,
            100
          )
        }%`;


    $(
      `#${prefix}GoalPercent`
    )
      .textContent =
        target

          ? `${percent}%`

          : "SET";

  }


  /* ========================================
     VERDICT
  ======================================== */

  function renderVerdicts(
    finished
  ) {

    const values = [
      "yah",
      "meh",
      "nah"
    ];


    $("#verdictStats")
      .innerHTML =

        values
          .map(
            value => {

              const count =
                finished.filter(
                  book =>
                    book.verdict ===
                    value
                ).length;


              const percent =
                finished.length

                  ? Math.round(
                      (
                        count /
                        finished.length
                      ) *
                      100
                    )

                  : 0;


              return `

                <article
                  class="verdict-stat ${value}"
                >

                  <div class="verdict-label">
                    ${value.toUpperCase()}
                  </div>

                  <strong>
                    ${percent}%
                  </strong>

                  <div class="verdict-count">

                    ${count}

                    BOOK${count === 1 ? "" : "S"}

                  </div>

                </article>

              `;

            }
          )
          .join("");

  }


  /* ========================================
     GENRES
  ======================================== */

  function renderGenres(
    finished
  ) {

    const counts =
      {};


    finished
      .forEach(
        book => {

          const genre =
            (
              book.genre ||
              "OTHER"
            )
              .trim()
              .toUpperCase();


          counts[genre] =
            (
              counts[genre] ||
              0
            ) + 1;

        }
      );


    const ranked =
      Object.entries(
        counts
      )
        .sort(
          (a, b) =>
            b[1] -
            a[1]
        );


    const host =
      $("#genreStats");


    if (
      !ranked.length
    ) {

      host.innerHTML = `

        <p class="eyebrow">
          NO GENRE DATA FOR
          THIS YEAR YET.
        </p>

      `;

      return;

    }


    host.innerHTML =
      ranked
        .map(
          (
            [
              genre,
              count
            ],
            index
          ) => {

            const percent =
              (
                count /
                finished.length
              ) *
              100;


            const size =
              Math.max(

                28,

                Math.min(
                  94,
                  26 +
                  percent *
                  1.25
                )

              );


            return `

              <div class="genre-poster-row">

                <span class="genre-rank">

                  ${
                    String(
                      index + 1
                    ).padStart(
                      2,
                      "0"
                    )
                  }

                </span>


                <span
                  class="genre-name"
                  style="font-size:${size}px"
                >

                  ${escapeHTML(genre)}

                </span>


                <span class="genre-percent">

                  ${percent.toFixed(1)}%

                </span>

              </div>

            `;

          }
        )
        .join("");

  }


  /* ========================================
     MONTH CHART
  ======================================== */

  function renderMonths(
    finished
  ) {

    const counts =
      Array(12)
        .fill(0);


    finished
      .forEach(
        book => {

          const month =
            Number(
              book.finishDate
                .slice(
                  5,
                  7
                )
            ) - 1;


          if (
            month >=
            0
          ) {

            counts[month]++;

          }

        }
      );


    const max =
      Math.max(
        1,
        ...counts
      );


    $("#monthChart")
      .innerHTML =

        counts
          .map(
            (
              count,
              index
            ) => {

              const height =
                Math.max(

                  2,

                  Math.round(
                    (
                      count /
                      max
                    ) *
                    145
                  )

                );


              return `

                <div class="month-item">

                  <span class="month-value">
                    ${count}
                  </span>

                  <div
                    class="month-bar"
                    style="height:${height}px"
                  ></div>

                  <span class="month-label">
                    ${MONTHS[index]}
                  </span>

                </div>

              `;

            }
          )
          .join("");

  }


  /* ========================================
     LIBRARY
  ======================================== */

  function initLibrary() {

    const params =
      new URLSearchParams(
        location.search
      );


    let selectedYear =
      params.get(
        "year"
      )

        ? Number(
            params.get(
              "year"
            )
          )

        : "all";


    if (
      params.get(
        "year"
      ) === "all"
    ) {

      selectedYear =
        "all";

    }


    const libraryState = {

      status:
        params.get(
          "status"
        ) ||
        "all",

      verdict:
        "all",

      sort:
        "reading-order",

      view:
        "archive"

    };


    const years =
      yearList();


    $("#libraryYearTabs")
      .innerHTML = [

        `
          <button
            class="year-tab"
            data-year="all"
          >
            ALL YEARS
          </button>
        `,

        ...years.map(
          year => `

            <button
              class="year-tab"
              data-year="${year}"
            >
              ${year}
            </button>

          `
        )

      ].join("");


    const genres =
      [
        ...new Set(

          loadBooks()

            .map(
              book =>
                (
                  book.genre ||
                  ""
                ).trim()
            )

            .filter(Boolean)

        )
      ]
        .sort(
          (a, b) =>
            a.localeCompare(b)
        );


    $("#genreFilter")
      .innerHTML +=

        genres
          .map(
            genre => `

              <option value="${escapeHTML(genre)}">

                ${escapeHTML(genre.toUpperCase())}

              </option>

            `
          )
          .join("");


    function syncButtons() {

      $$(
        "[data-status-filter]"
      )
        .forEach(
          button =>

            button.classList
              .toggle(
                "active",

                button.dataset
                  .statusFilter ===
                  libraryState.status
              )

        );


      $$(
        "[data-verdict-filter]"
      )
        .forEach(
          button =>

            button.classList
              .toggle(
                "active",

                button.dataset
                  .verdictFilter ===
                  libraryState.verdict
              )

        );


      $$(
        "[data-sort]"
      )
        .forEach(
          button =>

            button.classList
              .toggle(
                "active",

                button.dataset.sort ===
                  libraryState.sort
              )

        );


      $$(
        ".year-tab"
      )
        .forEach(
          button =>

            button.classList
              .toggle(
                "active",

                button.dataset.year ===
                  String(
                    selectedYear
                  )
              )

        );

    }


    function rerender() {

      syncButtons();


      renderLibrary(
        selectedYear,
        libraryState
      );

    }


    $$(
      ".year-tab"
    )
      .forEach(
        button =>

          button.addEventListener(
            "click",
            () => {

              selectedYear =
                button.dataset.year ===
                  "all"

                  ? "all"

                  : Number(
                      button.dataset.year
                    );


              const url =
                new URL(
                  location.href
                );


              if (
                selectedYear ===
                "all"
              ) {

                url.searchParams
                  .delete(
                    "year"
                  );

              }

              else {

                url.searchParams
                  .set(
                    "year",
                    selectedYear
                  );

              }


              history.replaceState(
                {},
                "",
                url
              );


              rerender();

            }
          )

      );


    $$(
      "[data-status-filter]"
    )
      .forEach(
        button =>

          button.addEventListener(
            "click",
            () => {

              libraryState.status =
                button.dataset
                  .statusFilter;


              rerender();

            }
          )

      );


    $$(
      "[data-verdict-filter]"
    )
      .forEach(
        button =>

          button.addEventListener(
            "click",
            () => {

              libraryState.verdict =
                button.dataset
                  .verdictFilter;


              rerender();

            }
          )

      );


    $("#librarySearch")
      .addEventListener(
        "input",
        rerender
      );


    $("#genreFilter")
      .addEventListener(
        "change",
        rerender
      );


    $("#sortMenuButton")
      .addEventListener(
        "click",
        () =>

          $("#sortMenu")
            .classList
            .toggle(
              "hidden"
            )

      );


    $$(
      "[data-sort]"
    )
      .forEach(
        button =>

          button.addEventListener(
            "click",
            () => {

              libraryState.sort =
                button.dataset.sort;


              $("#sortMenu")
                .classList
                .add(
                  "hidden"
                );


              rerender();

            }
          )

      );


    $("#archiveViewBtn")
      .addEventListener(
        "click",
        () => {

          libraryState.view =
            "archive";


          setLibraryView(
            "archive"
          );

        }
      );


    $("#indexViewBtn")
      .addEventListener(
        "click",
        () => {

          libraryState.view =
            "index";


          setLibraryView(
            "index"
          );

        }
      );


    rerender();

  }


  function getFilteredLibrary(
    selectedYear,
    state
  ) {

    let books =
      loadBooks();


    const search =
      $("#librarySearch")
        .value
        .trim()
        .toLowerCase();


    const genre =
      $("#genreFilter")
        .value;


    if (
      selectedYear !==
      "all"
    ) {

      books =
        books.filter(
          book =>
            bookYear(book) ===
            Number(
              selectedYear
            )
        );

    }


    if (search) {

      books =
        books.filter(
          book =>

            `${
              book.title
            } ${
              book.author
            }`
              .toLowerCase()
              .includes(
                search
              )

        );

    }


    if (
      state.status !==
      "all"
    ) {

      books =
        books.filter(
          book =>
            book.status ===
            state.status
        );

    }


    if (
      state.verdict !==
      "all"
    ) {

      books =
        books.filter(
          book =>
            book.verdict ===
            state.verdict
        );

    }


    if (
      genre !==
      "all"
    ) {

      books =
        books.filter(
          book =>
            book.genre ===
            genre
        );

    }


    books.sort(
      (a, b) => {

        if (
          state.sort ===
          "finished-desc"
        ) {

          return String(
            b.finishDate ||
            ""
          ).localeCompare(
            String(
              a.finishDate ||
              ""
            )
          );

        }


        if (
          state.sort ===
          "title-asc"
        ) {

          return a.title
            .localeCompare(
              b.title
            );

        }


        if (
          state.sort ===
          "author-asc"
        ) {

          return a.author
            .localeCompare(
              b.author
            );

        }


        if (
          state.sort ===
          "pages-desc"
        ) {

          return (
            Number(
              b.pages ||
              0
            ) -

            Number(
              a.pages ||
              0
            )
          );

        }


        if (
          state.sort ===
          "added-desc"
        ) {

          return String(
            b.createdAt ||
            ""
          ).localeCompare(
            String(
              a.createdAt ||
              ""
            )
          );

        }


        return (
          dateValue(a)
            .localeCompare(
              dateValue(b)
            ) ||

          String(
            a.createdAt ||
            ""
          )
            .localeCompare(
              String(
                b.createdAt ||
                ""
              )
            )
        );

      }
    );


    return books;

  }


  async function renderLibrary(
    selectedYear,
    state
  ) {

    const books =
      getFilteredLibrary(
        selectedYear,
        state
      );


    $("#libraryYearTitle")
      .textContent =

        selectedYear ===
          "all"

          ? "ALL YEARS"

          : String(
              selectedYear
            );


    $("#libraryBookCount")
      .textContent =
        formatNumber(
          books.length
        );


    $("#libraryPageCount")
      .textContent =
        formatNumber(

          books.reduce(
            (
              sum,
              book
            ) =>

              sum +
              Number(
                book.pages ||
                0
              ),

            0
          )

        );


    const groups =
      {};


    books
      .forEach(
        book => {

          const year =
            bookYear(book);


          if (
            !groups[year]
          ) {

            groups[year] =
              [];

          }


          groups[year]
            .push(book);

        }
      );


    const orderedYears =
      Object.keys(
        groups
      )

        .map(Number)

        .sort(
          (a, b) =>
            b - a
        );


    $("#libraryArchive")
      .innerHTML =

        orderedYears
          .map(
            year => {

              const yearBooks =
                groups[year];


              const yearPages =
                yearBooks.reduce(
                  (
                    sum,
                    book
                  ) =>

                    sum +
                    Number(
                      book.pages ||
                      0
                    ),

                  0
                );


              return `

                <section class="archive-year-section">

                  <header class="archive-year-header">

                    <h2>
                      ${year}
                    </h2>


                    <div class="archive-year-meta">

                      ${yearBooks.length}

                      BOOK${yearBooks.length === 1 ? "" : "S"}

                      <br>

                      ${formatNumber(yearPages)}

                      PAGES

                    </div>

                  </header>


                  <div class="archive-grid">

                    ${
                      yearBooks
                        .map(
                          archiveBookHTML
                        )
                        .join("")
                    }

                  </div>

                </section>

              `;

            }
          )
          .join("");


    $("#libraryIndexRows")
      .innerHTML =

        books
          .map(
            book => `

              <a
                class="index-row"
                href="book.html?id=${encodeURIComponent(book.id)}"
              >

                <span>
                  ${numberWithinYear(book)}
                </span>

                <span class="title">
                  ${escapeHTML(book.title)}
                </span>

                <span class="author">
                  ${escapeHTML(book.author)}
                </span>

                <span>
                  ${escapeHTML((book.genre || "—").toUpperCase())}
                </span>

                <span>
                  ${
                    book.pages
                      ? formatNumber(book.pages)
                      : "—"
                  }
                </span>

                <span class="verdict">
                  ${
                    book.verdict
                      ? book.verdict.toUpperCase()
                      : "—"
                  }
                </span>

              </a>

            `
          )
          .join("");


    $("#libraryEmpty")
      .classList
      .toggle(
        "hidden",
        books.length > 0
      );


    await hydrateCovers(
      $("#libraryArchive")
    );

  }


  function archiveBookHTML(book) {

    return `

      <a
        class="archive-book"
        href="book.html?id=${encodeURIComponent(book.id)}"
      >

        <div class="archive-cover">

          <span
            class="cover-placeholder"
            data-placeholder-for="${book.id}"
          >

            ${escapeHTML(book.title)}

          </span>


          <img
            class="book-cover"
            data-cover-for="${book.id}"
            alt="${escapeHTML(book.title)} cover"
            hidden
          >

        </div>


        <div class="archive-meta">

          <span class="archive-number">
            ${numberWithinYear(book)}
          </span>


          <div class="archive-copy">

            <h3>
              ${escapeHTML(book.title)}
            </h3>

            <p>
              ${escapeHTML(book.author)}
            </p>

          </div>


          <div class="archive-book-data">

            ${
              book.pages
                ? `${formatNumber(book.pages)} PP.`
                : ""
            }

            ${
              book.verdict
                ? `<br>${book.verdict.toUpperCase()}`
                : ""
            }

          </div>

        </div>

      </a>

    `;

  }


  function setLibraryView(view) {

    const archive =
      view ===
      "archive";


    $("#libraryArchive")
      .classList
      .toggle(
        "hidden",
        !archive
      );


    $("#libraryIndex")
      .classList
      .toggle(
        "hidden",
        archive
      );


    $("#archiveViewBtn")
      .classList
      .toggle(
        "active",
        archive
      );


    $("#indexViewBtn")
      .classList
      .toggle(
        "active",
        !archive
      );

  }


  /* ========================================
     GOALS PAGE
  ======================================== */

  function initGoals() {

    const params =
      new URLSearchParams(
        location.search
      );


    const requested =
      Number(
        params.get(
          "year"
        )
      );


    if (requested) {

      selectedGoalYear =
        requested;

    }


    const years =
      yearList();


    if (
      !years.includes(
        CURRENT_YEAR + 1
      )
    ) {

      years.unshift(
        CURRENT_YEAR + 1
      );

    }


    const unique =
      [
        ...new Set(
          years
        )
      ]
        .sort(
          (a, b) =>
            b - a
        );


    $("#goalYearTabs")
      .innerHTML =

        unique
          .map(
            year => `

              <button
                class="year-tab"
                data-goal-year="${year}"
              >
                ${year}
              </button>

            `
          )
          .join("");


    $$(
      "[data-goal-year]"
    )
      .forEach(
        button =>

          button.addEventListener(
            "click",
            () => {

              selectedGoalYear =
                Number(
                  button.dataset
                    .goalYear
                );


              const url =
                new URL(
                  location.href
                );


              url.searchParams
                .set(
                  "year",
                  selectedGoalYear
                );


              history.replaceState(
                {},
                "",
                url
              );


              renderGoalsPage(
                selectedGoalYear
              );

            }
          )

      );


    $("#openGoalEditor")
      .addEventListener(
        "click",
        () =>
          openGoalModal(
            selectedGoalYear
          )
      );


    renderGoalsPage(
      selectedGoalYear
    );

  }


  function renderGoalsPage(year) {

    selectedGoalYear =
      year;


    $$(
      "[data-goal-year]"
    )
      .forEach(
        button =>

          button.classList
            .toggle(
              "active",

              Number(
                button.dataset
                  .goalYear
              ) === year
            )

      );


    const {
      finished,
      pages
    } =
      yearlyStats(year);


    const goals =
      loadGoals()[year] ||
      {
        bookGoal:
          0,

        pageGoal:
          0
      };


    const bookGoal =
      Number(
        goals.bookGoal ||
        0
      );


    const pageGoal =
      Number(
        goals.pageGoal ||
        0
      );


    const bookPercent =
      bookGoal

        ? Math.round(
            (
              finished.length /
              bookGoal
            ) *
            1000
          ) / 10

        : 0;


    const pagePercent =
      pageGoal

        ? Math.round(
            (
              pages /
              pageGoal
            ) *
            1000
          ) / 10

        : 0;


    $("#goalDisplayYearA")
      .textContent =
        year;


    $("#goalDisplayYearB")
      .textContent =
        year;


    $("#goalTargetBooks")
      .textContent =
        bookGoal

          ? formatNumber(
              bookGoal
            )

          : "—";


    $("#goalTargetPages")
      .textContent =
        pageGoal

          ? formatNumber(
              pageGoal
            )

          : "—";


    $("#goalCurrentBooks")
      .textContent =
        formatNumber(
          finished.length
        );


    $("#goalCurrentPages")
      .textContent =
        formatNumber(
          pages
        );


    $("#goalBookBar")
      .style.width =
        `${
          Math.min(
            bookPercent,
            100
          )
        }%`;


    $("#goalPageBar")
      .style.width =
        `${
          Math.min(
            pagePercent,
            100
          )
        }%`;


    $("#goalBookPercent")
      .textContent =
        bookGoal

          ? `${bookPercent}% COMPLETE`

          : "SET A GOAL";


    $("#goalPagePercent")
      .textContent =
        pageGoal

          ? `${pagePercent}% COMPLETE`

          : "SET A GOAL";


    $("#goalEditPrompt")
      .textContent =
        `SET YOUR ${year} READING TARGETS.`;

  }


  /* ========================================
     BOOK DETAIL
  ======================================== */

  async function initBookDetail() {

    const id =
      new URLSearchParams(
        location.search
      )
        .get(
          "id"
        );


    const book =
      loadBooks()
        .find(
          book =>
            book.id ===
            id
        );


    const host =
      $("#bookDetail");


    if (!book) {

      host.innerHTML = `

        <section class="empty-state">

          <span>
            404 / BOOK
          </span>

          <h2>
            Book not found.
          </h2>

          <a
            class="button button-blue"
            href="library.html"
          >
            BACK TO LIBRARY
          </a>

        </section>

      `;

      return;

    }


    const year =
      bookYear(book);


    host.innerHTML = `

      <article class="book-detail">

        <section class="book-detail-top">

          <div class="book-detail-cover-column">

            <div class="book-detail-cover">

              <span
                class="cover-placeholder"
                data-placeholder-for="${book.id}"
              >

                ${escapeHTML(book.title)}

              </span>


              <img
                class="book-cover"
                data-cover-for="${book.id}"
                alt="${escapeHTML(book.title)} cover"
                hidden
              >

            </div>

          </div>


          <div class="book-detail-info">

            <span class="book-code">

              BK—${numberWithinYear(book)}
              /
              ${year}

            </span>


            <h1 class="book-detail-title">

              ${escapeHTML(book.title)}

            </h1>


            <p class="book-detail-author">

              ${escapeHTML(book.author)}

            </p>


            <div class="book-detail-meta">

              <div>

                <strong>
                  ${escapeHTML((book.genre || "—").toUpperCase())}
                </strong>

                <span>
                  GENRE
                </span>

              </div>


              <div>

                <strong>

                  ${
                    book.pages
                      ? formatNumber(book.pages)
                      : "—"
                  }

                </strong>

                <span>
                  PAGES
                </span>

              </div>


              <div>

                <strong>

                  ${
                    book.verdict
                      ? book.verdict.toUpperCase()
                      : "—"
                  }

                </strong>

                <span>
                  VERDICT
                </span>

              </div>


              <div>

                <strong>

                  ${escapeHTML(
                    (
                      book.status ||
                      "—"
                    )
                      .replaceAll(
                        "-",
                        " "
                      )
                      .toUpperCase()
                  )}

                </strong>

                <span>
                  STATUS
                </span>

              </div>


              <div>

                <strong>
                  ${
                    book.favorite
                      ? "YES"
                      : "NO"
                  }
                </strong>

                <span>
                  ALL-TIME FAVORITE
                </span>

              </div>


              <div>

                <strong>
                  ${
                    book.reread
                      ? "YES"
                      : "NO"
                  }
                </strong>

                <span>
                  RE-READ
                </span>

              </div>

            </div>


            <div class="book-detail-actions">

              <button
                id="editBookBtn"
                class="button button-blue"
                type="button"
              >
                EDIT BOOK
              </button>


              <button
                id="deleteBookBtn"
                class="button"
                type="button"
              >
                DELETE
              </button>

            </div>

          </div>

        </section>


        <section class="book-detail-body">

          <div class="book-detail-section">

            <h2>
              READING DATA
            </h2>


            <div class="metadata-list">

              <div class="metadata-row">

                <span>
                  STARTED
                </span>

                <strong>
                  ${formatDate(book.startDate)}
                </strong>

              </div>


              <div class="metadata-row">

                <span>
                  FINISHED
                </span>

                <strong>
                  ${formatDate(book.finishDate)}
                </strong>

              </div>


              <div class="metadata-row">

                <span>
                  FORMAT
                </span>

                <strong>
                  ${escapeHTML(book.format || "—")}
                </strong>

              </div>


              <div class="metadata-row">

                <span>
                  SERIES
                </span>

                <strong>
                  ${escapeHTML(book.series || "—")}
                </strong>

              </div>

            </div>

          </div>


          <div class="book-detail-section">

            <h2>
              NOTES
            </h2>


            <div class="book-notes">

              ${escapeHTML(book.notes || "No notes added.")}

            </div>

          </div>

        </section>

      </article>

    `;


    await hydrateCovers(
      host
    );


    $("#editBookBtn")
      .addEventListener(
        "click",
        () =>
          openBookModal(
            book
          )
      );


    $("#deleteBookBtn")
      .addEventListener(
        "click",
        async () => {

          if (
            !confirm(
              `Delete “${book.title}”? This cannot be undone unless you have a backup.`
            )
          ) {

            return;

          }


          saveBooks(

            loadBooks()
              .filter(
                existing =>
                  existing.id !==
                  book.id
              )

          );


          if (
            book.coverId
          ) {

            await deleteCover(
              book.coverId
            );

          }


          location.href =
            "library.html";

        }
      );

  }


  /* ========================================
     START
  ======================================== */

  function init() {

    initChrome();


    const page =
      document.body
        .dataset.page;


    if (
      page ===
      "home"
    ) {

      initHome();

    }


    if (
      page ===
      "library"
    ) {

      initLibrary();

    }


    if (
      page ===
      "goals"
    ) {

      initGoals();

    }


    if (
      page ===
      "book"
    ) {

      initBookDetail();

    }

  }


  document.addEventListener(
    "DOMContentLoaded",
    init
  );

})();