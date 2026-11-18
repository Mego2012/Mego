# MEGO — Audio and narration licence audit

Audit date: 18 November 2026. Scope: every audio and voice asset produced for or shipped with MEGO.

## 1. Inventory

| # | Asset | Location | Produced with | Used where |
| --- | --- | --- | --- | --- |
| 1 | Arabic narration track of the video tutorial | Inside **"MEGO Complete User Guide – Arabic.mp4"** (Google Drive → MEGO – Complete User Guide & Tutorials → 01 – Video Tutorials; file id `1JcHZWL-QMqgLpeN9-Omkq_fMaR3D29Lz`) | Piper TTS, voice model **`ar_JO-kareem-medium`** | Video only |
| 2 | English narration track | Inside **"MEGO Complete User Guide – English.mp4"** (same folder; file id `1cdJ8dRBBBBzOM8xoUozKjkRigLBZSUl2`) | Piper TTS, voice model **`en_US-ljspeech-high`** | Video only |
| 3 | Intermediate WAV clips and the voice model files | Build workspace of the documentation session only (not in the repository, not on Drive) | Same as above | Not distributed |
| — | **App audio** | **None.** The MEGO app contains no audio files and no generated speech. `git ls-files` finds no `.wav/.mp3/.ogg/.m4a/.onnx` | — | — |

The Piper TTS **software** (GPL-3.0) was only used as a tool; its licence does not attach to the audio it produces.
The licence question is about the **voice models** and the **recordings they were trained on**.

## 2. Licence status per voice

| Voice | Training data | Licence of the data | Commercial / public use | Attribution |
| --- | --- | --- | --- | --- |
| `en_US-ljspeech-high` (English) | LJ Speech dataset (keithito.com/LJ-Speech-Dataset), trained from scratch | **Public domain** (model card: "License: public domain") | **Allowed** | Not required (credit appreciated) |
| `ar_JO-kareem-medium` (Arabic) | Dataset `github.com/AliMokhammad/arabicttstrain`, **fine-tuned from the US-English `lessac` voice** (model card) | Dataset repository: **no licence stated** (no LICENSE file, no licence section; checked 18 Nov 2026). Base voice `lessac` (Blizzard Challenge 2013 data, University of Edinburgh licence): **research only**, explicitly excluding "any commercial purpose, including the development, marketing, commercialisation, sale or licencing of voice synthesis"; non-transferable, no sub-licensing, no redistribution without written consent | **Not cleared.** With no licence for the dataset and a research-only base, public or commercial distribution of this voice's output cannot be justified | Unknown, because no licence exists |

### Verdict

* **English video: OK** for public and commercial use.
* **Arabic video: licensing risk.** It may be kept private or for personal reference, but it should **not** be published
  publicly or commercially until the narration is replaced. The video's screen recording, subtitles and script are
  MEGO's own work and can be reused unchanged; only the voice track needs replacing.
* **Not replaced.** You asked for approval first.

## 3. Alternatives for the Arabic narration (for your decision)

The full Arabic narration script is short. The 83-segment subset alone is about **7,000 characters**, and the whole
27-chapter script is a small multiple of that, far below every free tier listed here.

| Option | Arabic quality | Licence / terms | Cost | Needs from you | Notes |
| --- | --- | --- | --- | --- | --- |
| **A. Human narrator** (you, a friend, or a paid voice artist) | Best: natural, can be Saudi/Gulf | Written consent / buy-out agreement from the speaker | 0 (yourself) to a one-time fee | Record ~25–30 min; I align it to the existing video | **Recommended for a public launch.** Clearest rights |
| **B. Microsoft Azure AI Speech, neural voices** `ar-SA-HamedNeural` (male), `ar-SA-ZariyahNeural` (female); also `ar-EG-*` | Very good, Saudi accent available | Service terms of Azure; synthesized output may be used in your own products under Microsoft's terms (**confirm in the Azure Product Terms when you sign up**) | Free tier **F0: 0.5 million neural characters per month** (official Azure pricing pages) | Create an Azure account (needs identity verification), create a Speech resource on F0 | **Best free option.** Fits the free tier many times over |
| **C. Google Cloud Text-to-Speech**, Arabic (`ar-XA`) WaveNet / Neural2 voices | Very good | Google Cloud terms | Free monthly allowance (WaveNet up to 4 million characters, Neural2 1 million, per Google's pricing page), **but billing must be enabled on the project**, with automatic charges above the free amount | Enable billing on a Google Cloud project | Works, but requires a billing account, which the rules of this project ask you to approve first |
| D. Meta MMS-TTS Arabic (`facebook/mms-tts-ara`) | Fair, robotic | **CC BY-NC 4.0, non-commercial** | 0 | — | **Not suitable** for commercial use |
| E. Coqui XTTS, F5-TTS and other open voice-cloning models | Good | Non-commercial model licences (CPML / CC BY-NC) | 0 | — | **Not suitable** for commercial use |
| F. Keep the current Arabic video **unlisted / personal only** | as is | as above | 0 | Make sure the Drive link is not published | Interim measure only |

### Recommendation

1. **Interim (now):** keep the Arabic video private; do not publish or promote it.
2. **For launch:** **Option A** (human narration, cleanest rights) if you can record about 30 minutes. Otherwise
   **Option B**, Azure `ar-SA-HamedNeural` or `ar-SA-ZariyahNeural` on the free F0 tier. Same script, same video;
   I can regenerate the narration track and re-time the subtitles once you approve and provide access.
3. Keep the English video as it is.

## 4. Sources

* Piper voice model cards (`ar_JO-kareem-medium`, `en_US-ljspeech-high`, `en_US-lessac-high`), read from the model files.
* Lessac / Blizzard 2013 licence: https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html
* Arabic dataset repository: https://github.com/AliMokhammad/arabicttstrain (no licence found, 18 Nov 2026)
* Meta MMS-TTS Arabic model card (CC BY-NC 4.0): https://huggingface.co/facebook/mms-tts-ara
* Azure AI Speech pricing (F0 free tier): https://azure.microsoft.com/pricing/details/cognitive-services/speech-services
* Azure Arabic neural voices: https://learn.microsoft.com/azure/ai-services/speech-service/language-support?tabs=tts
* Google Cloud Text-to-Speech pricing: https://cloud.google.com/text-to-speech/pricing

*This is a technical licence audit, not legal advice. Confirm provider terms when you accept them.*
