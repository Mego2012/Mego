# MEGO — Legal review pack (for the owner and the lawyer)

Prepared 19 November 2026. **Not legal advice and not a compliance statement.** It lists what the drafts already say
(each point checked against the app), what is still missing, and questions for the lawyer. Nothing here was invented:
the missing items are left for the owner or the lawyer.

Documents under review: `MEGO_PRIVACY_POLICY_EN.md`, `MEGO_PRIVACY_POLICY_AR.md`, `MEGO_TERMS_EN.md`,
`MEGO_TERMS_AR.md` (identical text to the in-app pages, Settings → About; draft of 19 November 2026).

## 1. Facts already in the drafts (verified)

| Fact | How it was verified |
| --- | --- |
| Data stored in Google Firebase (Authentication + Cloud Firestore), database region **me-central2 (Dammam, Saudi Arabia)** | Firebase project setup record; stated in the privacy policy §"Where data is stored" |
| Each account's data readable and writable only by that account | Firestore security rules; live test 19 Nov 2026 (another user, signed-out requests and the administrator are refused: 20/20 checks) |
| Meal-scanner photos go to Google's **Gemini API**, may be processed **outside Saudi Arabia**, and are **not stored by MEGO** | Backend code (`apps-script/Code.gs`: photo sent, result returned, nothing saved); live scan test 19 Nov 2026 |
| Users can view, correct, export and delete their data in the app; deleting the account deletes the cloud records and the sign-in | App features; live test (records empty and sign-in refused after deletion) |
| No advertising, no sale of data, no tracking/analytics SDK | Code review of the bundle and `package.json` dependencies |
| 18+ age confirmation at registration | Registration screen (`reg-age18`, required) |
| Nutrition information is general, not medical advice | Terms; in-app disclaimers |

## 2. Missing items — need the owner (cannot be verified from here)

| # | Item | Where it goes | Note |
| --- | --- | --- | --- |
| 1 | **Operator**: legal name of the person or company running MEGO | Privacy §1, Terms §1 | If a company: registered name and commercial registration number |
| 2 | **Country** of the operator | Privacy §1, Terms "Governing law" | Decides which law applies (see §3) |
| 3 | **Official contact e-mail** for privacy requests | Privacy §1 and §"Your rights" | Should be a mailbox you monitor; not a personal address unless you accept that |
| 4 | **Governing law and courts** | Terms "Governing law" | Owner decides with the lawyer |

## 3. Missing items — need the lawyer

| # | Item | Questions for the lawyer |
| --- | --- | --- |
| 5 | **User rights and response times** | If Saudi law applies (Personal Data Protection Law, PDPL): confirm the rights list and the response period. Public commentary describes a 30-day response period, extendable in defined cases, and a 2026 SDAIA consultation on amendments to the Implementing Regulations (status to be confirmed). Name the competent authority (SDAIA) if applicable. |
| 6 | **Limitation of liability** | Wording, and what may not be excluded under the chosen law (e.g. consumer protections). |
| 7 | **Sensitive data** | Body weight, measurements, nutrition and exercise logs may count as health data. Does that require explicit consent or extra safeguards? (The app currently asks for consent to the terms and privacy policy at registration.) |
| 8 | **Cross-border transfer for the AI scanner** | Photos are sent to Google Gemini, possibly outside Saudi Arabia. Which transfer basis/mechanism is needed (consent, standard clauses, risk assessment)? The scanner is optional and only used when the user takes a photo. |
| 9 | **Google as processor** | Is a reference to Google's Firebase/Cloud data processing terms enough, or is a separate agreement needed? |
| 10 | **Retention** | The drafts say data is kept until the user deletes it or the account. Confirm whether a maximum retention period for inactive accounts is required. |

## 4. What the owner should NOT publish before review

* "Compliant with PDPL/GDPR" or similar claims. The drafts make no such claim and should not until the lawyer
  confirms.
* Any operator or contact details that are not final.

## 5. Sources consulted for the questions above (commentary, not the regulation text)

* Clyde & Co, "SDAIA publishes draft amendments to the PDPL" (Oct 2026): https://www.clydeco.com/en/insights/2026/10/sdaia-publishes-draft-amendments-to-the-pdpl
* Al Tamimi, SDAIA consultation on the Implementing Regulation (Oct 2026): https://www.tamimi.com/news/sdaia-opens-public-consultation-on-proposed-amendments-to-the-pdpl-implementing-regulation/
* Akin Gump, 10 key proposed changes: https://www.akingump.com/en/insights/alerts/saudi-data-and-ai-authority-proposes-amendments-to-implementing-regulations-of-the-pdpl-10-key-proposed-changes
* Pinsent Masons, Saudi consultation proposes data protection reform: https://www.pinsentmasons.com/out-law/analysis/saudi-consultation-proposes-data-protection-reform

The lawyer should rely on the official texts published by SDAIA / the National Data Governance Platform.
