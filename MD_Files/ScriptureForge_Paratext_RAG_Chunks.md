# Scripture Forge and Paratext QA Knowledge

This knowledge file summarizes the attached Scripture Forge QA scenarios and official user help. Each topic is intentionally short for retrieval chunking. UI labels in the attached QA scenarios may differ from the current product. Treat official help guidance as current behavior and the attachment as scenario-specific expected behavior.

## Paratext: Create a Standard Translation Project
In Paratext, switch to the full menu and choose New Project. Enter the project name and language, then select Standard Translation. Register online when prompted and verify registration before closing project properties. Create needed books through Manage Books > Create Book(s), select the books, and verify they appear in the project. The attachment uses the QA project name “Scriptureforge QA,” French, and Genesis, Matthew, Ruth, and John as test data; these are not general product requirements.

Source: attached Updated TC SF.md. Paratext manual overview: https://manual.paratext.org/Overview/

## Paratext: Users, Book Access, and Send/Receive
Project administrators can manage project permissions from Project settings > User permission in the attached scenario. Add a user using their registered Paratext username, assign a role such as Translator, and review book-level permissions separately. The test scenario removes Genesis access for the added user and verifies the selection. Close the permission dialogs, then use Send/Receive this Project to share Paratext changes; verify the completion message. Exact menu labels can vary by Paratext version and permissions.

Source: attached Updated TC SF.md. Paratext manual overview: https://manual.paratext.org/Overview/

## Paratext: Create a Back Translation Project
For the attached back-translation setup, create a new project, set its language, choose Back Translation as the project type, and select an existing base project. Verify the project indicates that it inherits registration from the base project. Choose the offered USFM version during creation, then create the required books and verify them. A back translation is a translation from the vernacular text into a source language; project setup options and supported formats should be verified in the installed Paratext version.

Source: attached Updated TC SF.md. Drafting context: https://help.scriptureforge.org/understanding-drafts

## Sign In to Scripture Forge
The official help describes signing in with a Paratext account: open Scripture Forge, choose Log In (or Sign Up for a new account), then choose the Paratext option. Authorize the connection and enter the email associated with the Paratext Registry account; submit it with the Login arrow or Enter. Complete any subsequent identity-provider steps and verify access to My Projects. The attached test uses https://qa.scriptureforge.org/; that is a test environment, not the normal public site URL.

Source: https://help.scriptureforge.org/log-in

## Connect a Paratext Project to Scripture Forge
Only a project admin can connect a not-yet-connected Paratext project from My Projects. Select Connect for the project and follow the connection workflow. The connection creates a Scripture Forge copy that can sync with Paratext. The attached test selects DBL source FRC97 and checks Enable Community Checking before Connect; treat those selections as test data, not universal defaults. A Paratext member can use Join when the project is already connected.

Source: https://help.scriptureforge.org/connect-paratext-project

## Enable Community Checking
A project admin is required to configure community checking. During initial connection, keep Enable Community Checking selected if community feedback is needed. For an existing connected project, open project Settings and enable the checkbox in the Community checking section. Verify the setting is enabled before inviting checkers. Availability and exact labels may depend on the account role and current application version.

Source: https://help.scriptureforge.org/enable-community-checking

## Create a Scripture Forge Checking Question
In Scripture Forge, open Manage questions under Community Checking and choose Add Question. Enter a Scripture reference directly or use the reference picker to choose a book, chapter, and verse. For a multi-verse question, provide an ending reference. Confirm the selected passage is highlighted, enter the question, and choose Save. Verify the question appears in the question list. The attachment uses references such as GEN 1:1 and RUT 1:1 as examples; valid book abbreviations should follow Paratext conventions.

Source: https://help.scriptureforge.org/adding-questions

## Import Community Questions from a Spreadsheet
The current Scripture Forge help documents importing questions from CSV. Prepare columns named Reference and Question; other columns are ignored. Use Paratext book abbreviations in references, for example HEB 1:1 rather than Hebrews 1:1. Save from Excel as CSV UTF-8, then open Manage questions > Import > Import from CSV file and select the file. Invalid or incomplete rows may be skipped with a warning. The attachment mentions TSV preparation, but the official help currently describes CSV import, so verify format support in the target version.

Source: https://help.scriptureforge.org/adding-questions

## Invite Community Checkers
Once questions are available, a project member with the required permissions can invite community checkers. The official guide describes opening Users and choosing Share, selecting the display language, and copying the invitation link. A recipient opens the link and joins as a community checker. Email invitations can also be sent by entering an email, selecting the Community Checker role, and choosing an invitation language. The attached QA scenario verifies that invitees reach a join page and can enter a name.

Source: https://help.scriptureforge.org/managing-checkers

## Community Answers, Comments, and Likes
The attached DOK 181 and DOK 187 scenarios cover a checker opening a question, adding an answer, saving it, and adding a comment below an answer. The admin then verifies the answer/comment indicators or counts, reviews the checker response, and may like the answer. Verify saved text appears under the correct question and the corresponding counts update. These are attachment-specific test assertions; actual visibility of other checkers’ responses depends on the project’s interaction settings.

Sources: attached Updated TC SF.md; interaction settings: https://help.scriptureforge.org/managing-checkers

## Community Checker Response Visibility
Scripture Forge can hide existing community answers while a checker is composing a response to avoid influencing that response. After a question is answered, other answers may become visible so checkers can comment on or like them. Project settings control whether checkers see one another’s answers and comments. Test both enabled and disabled configurations separately; do not assume every checker sees all responses immediately.

Source: https://help.scriptureforge.org/managing-checkers

## Sync Scripture Forge with Paratext
Use Sync with Paratext in Scripture Forge to send and receive project changes; the official guide says progress is shown and a sync commonly takes one to three minutes, though it can take longer. Sync after Paratext Send/Receive when new text should appear in Scripture Forge, and sync Scripture Forge changes before retrieving them in Paratext. Avoid long delays before syncing edits because later Paratext edits can cause conflicts. Retry a failed sync; contact Scripture Forge support if failures persist.

Source: https://help.scriptureforge.org/syncing-with-paratext

## Attach Chapter Audio and Timing
Scripture Forge community checking supports chapter audio in MP3 or WAV and timing files from HearThis, aeneas, Audacity, or Adobe Audition. In Questions & answers, navigate to the chapter, open Manage Audio, choose the audio and matching timing file, and save. Timing data enables verse highlighting during playback. The attached test setup uses HearThis to create Genesis audio and timing files; verify the generated files and selected chapter before saving.

Sources: https://help.scriptureforge.org/adding-questions; attached Updated TC SF.md; HearThis: https://software.sil.org/hearthis/

## Scripture Forge Draft Generation: Purpose and Review
Scripture Forge drafts are rough starting points for translation teams, not finished or error-free translations. Teams must review and edit every generated draft; usefulness as an editing aid is the goal. Drafting has a language-learning stage using parallel text, followed by translation of the selected text. More parallel text generally helps the model learn the language. Long passages may be truncated because sentence length is limited, so check draft completeness.

Source: https://help.scriptureforge.org/understanding-drafts

## Scripture Forge Draft Generation: Getting Started
Connect the Paratext project and select the appropriate reference text. In the attached test workflow, the user opens Generate Draft, proceeds through setup, selects books to draft and books for training, reviews the summary, and starts generation. Official help says vernacular drafting requires onboarding by the SIL NLP team; back-translation drafting is available to Paratext users subject to supported language requirements. The official guide says generation typically takes about 1.5 hours or longer. Preview results and import chapters individually.

Sources: https://help.scriptureforge.org/understanding-drafts; attached Updated TC SF.md (deprecated draft-generation scenario)

## Draft Generation: Back Translation and Data Readiness
A back translation draft converts vernacular text into a supported source language and requires some existing back-translated books for training. For vernacular drafting, the system learns from parallel source/target sentences before drafting new text. The official help recommends reviewing guidance when a project has fewer than 6,000 completed verses. Do not treat generated text as approved: translators must inspect, correct, and refine it before use.

Source: https://help.scriptureforge.org/understanding-drafts

## Paratext Workflow Stages
The Paratext training manual organizes work into stages: initial drafting, team checking, preparation for consultant review, consultant checking, community review, and finalization/publication. The manual overview lists topics including keyboarding a draft, basic checks, proper names, spelling, glossary and biblical terms, notes, back translation, collaboration tools, parallel passages, and publication. Use these topics to classify test cases by workflow stage; consult the relevant current manual chapter for version-specific procedures.

Source: https://manual.paratext.org/Overview/ (manual states the overview’s page references correspond to its PDF)

## Paratext Notes and Footnotes: Attached QA Scenario
The attached Paratext test scenario selects Genesis 1, opens the first verse’s context menu, inserts a footnote, enters content between the USFM markers \ft and \f*, and verifies a footnote indicator. It separately inserts a note, enters text, saves, and verifies a note indicator. These are scenario-specific UI steps; confirm the editor’s current context-menu labels and supported markers in the installed Paratext version.

Source: attached Updated TC SF.md. Paratext manual overview: https://manual.paratext.org/Overview/

## Scripture Forge Project Sharing and Cleanup: QA Scenario
The attached scenario creates a question, opens Share, selects English (US) for the invitation language, copies the link, and verifies a “Link copied to clipboard” message. Its cleanup deletes the QA project from Settings > Danger zone after entering the exact project name and confirming deletion. Use cleanup only for disposable test projects; never apply destructive cleanup steps to a real translation project.

Sources: attached Updated TC SF.md; invitation guidance: https://help.scriptureforge.org/managing-checkers

## Source and Environment Guidance
The attached test cases use https://qa.scriptureforge.org/ and sample project/resource names such as “Scriptureforge QA” and FRC97. These are environment-specific test data. Current official help pages use the public Scripture Forge site and describe production workflows. When a UI label or step differs, verify the app version, user role, and environment before treating the test scenario as a product defect.

Sources: attached Updated TC SF.md; https://help.scriptureforge.org/; https://manual.paratext.org/Overview/
