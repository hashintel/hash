# Custom words

On the Petrinaut website, open **User settings → Labs**, select **Use Brunch**, turn on **Enable Voice**, and enable **Custom words**. Custom words is off by default and does not start Voice or the microphone. Turning off Voice in Labs also stops words from being used.

## Add a name or term

Switch the assistant to **Voice**, then choose **Words** in its header and **Add word**. Words appears only in Voice mode; returning to text chat hides it without deleting your list. Enter the correct spelling and, optionally, a short pronunciation note such as “relay desk”. Choose **Save word**. Use **Edit** or **Remove** beside an existing entry to change the list. Chat and Ledger remain available when you close the dialog.

Use names and terms, not definitions or instructions. The list accepts up to 50 unique spellings, 80 characters per spelling, 120 per pronunciation note, and 1,000 spelling characters in total. A shared size limit also applies to words and notes; shorten them if saving reports that the voice budget is exceeded. Capitalization is preserved; duplicates ignore case.

## When hints apply

- **Brunch:** every request, typed or spoken, carries the current list, so changes apply from your next request. They are hints, not new process facts.
- **Hearing:** spellings are added to the transcription prompt when a Voice session starts. Both Live and Realtime keep their existing transcription model and pause detection.
- **Speaking:** only entries with pronunciation notes are supplied to the speaking model when a Voice session starts. They guide delivery, not the written answer.

Hearing and speaking keep the list a Voice session started with, including across its retries. To apply changes to them, end the session and start Voice again. Returning to text chat ends a session; with Live, so does closing the assistant panel. Hints are best effort: recognition and pronunciation can still be wrong. Very short speech during assistant playback may still be ignored by existing Voice filtering.

## Storage and privacy

The editable list belongs to this Brunch conversation in this browser. Reloading restores it when browser storage is available. Other conversations and browsers have separate lists. Words are not included in net exports, imports, or duplicates. **Clear conversation** removes its local list and starts a new, empty one. Disabling Words or switching to the stock assistant hides the controls without deleting saved words.

If another tab removes the word you are editing, saving keeps your draft open and explains that the word was removed. Copy any text you want to keep, then choose **Cancel** and **Add word** to add it again.

If browser storage fails, the dialog says **Available in this tab; browser storage is unavailable**. Such edits can be used until this tab or conversation is closed but may not survive a reload. Invalid saved data is not used as hints.

Used spellings are sent with requests to Brunch and its model provider and may remain in conversation history. Voice hints are sent to OpenAI. Pronunciation notes go only to the speaking model. Removing a word does not erase past requests or provider data. Do not add secrets.
