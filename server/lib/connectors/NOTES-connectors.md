# Connectors — importing a profile

`linkedin-paste`: the user copies their own LinkedIn profile page and pastes the text. `linkedin-export`: they paste the text of a PDF they exported themselves (LinkedIn → Me → Resources → Save to PDF). Both run the same parser. `cv-file`: an existing CV, its text extracted first by `cv/extract.js`. `profile-manual`: typed fields. `job-paste` and `job-link` feed scoring; capture lives in `jobs/capture.js`.

Every connector is user-initiated. There is no OAuth: LinkedIn's public API returns a name, an email and an identifier, not a career history, and scraping breaches their terms and SPEC §1. So nothing here fetches or connects. Both LinkedIn connectors report warnings when a section is missing, so the UI can ask for it instead of saving a thin profile quietly.

UI: one paste box, a link showing where to find LinkedIn's "Save to PDF", and the line "a pasted profile is enough to start".
