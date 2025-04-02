console.log("%c LabAssistant: Content script injected at " + new Date().toISOString(), "background: #4285f4; color: white; padding: 2px 5px; border-radius: 2px;");

// Log the DOM structure to help debug selectors
setTimeout(() => {
    console.log("Notebook DOM Structure check:");
    console.log("  .jp-CodeCell elements:", document.querySelectorAll('.jp-CodeCell').length);
    console.log("  .jp-CodeCell.jp-mod-active elements:", document.querySelectorAll('.jp-CodeCell.jp-mod-active').length);
    console.log("  .CodeMirror elements:", document.querySelectorAll('.CodeMirror').length);
    console.log("  .jp-CodeCell .CodeMirror elements:", document.querySelectorAll('.jp-CodeCell .CodeMirror').length);
    
    // Try alternative selectors for CodeMirror editors in Jupyter
    const cmAlternatives = [
        '.jp-CodeCell.jp-mod-active .CodeMirror',
        '.jp-CodeMirror-Editor',
        '.cm-editor',  // CodeMirror 6 uses this class
        '.CodeMirror'
    ];
    
    cmAlternatives.forEach(selector => {
        console.log(`  Selector '${selector}' matches:`, document.querySelectorAll(selector).length);
    });
}, 2000);

let suggestionTimeout = null;
let currentSuggestion = null; // Store the suggestion text
let suggestionElement = null; // Store the DOM element for the suggestion
let lastActiveEditor = null; // Keep track of the editor we attached listeners to
let currentDelay = 500; // Default delay, will be updated from storage

// Function to remove existing suggestion element
function dismissSuggestion() {
    if (suggestionElement) {
        console.log("Dismissing suggestion.");
        suggestionElement.remove();
        suggestionElement = null;
        currentSuggestion = null;
    }
}

// Function to clean code suggestion, removing markdown code blocks if present
function cleanCodeSuggestion(text) {
    console.log("Cleaning suggestion:", text);
    
    // Check for markdown code blocks with language specified (```python, ```javascript, etc)
    const markdownRegex = /^```\w*\s*\n?([\s\S]*?)\n?```$/;
    const match = text.match(markdownRegex);
    
    if (match && match[1]) {
        console.log("Removing markdown code block wrapper");
        return match[1].trim();
    }
    
    return text.trim();
}

// Function to display the suggestion
// This is simplified - positioning might need significant work for robustness.
function displaySuggestion(suggestionText) {
    dismissSuggestion(); // Remove any old one
    if (!lastActiveEditor) {
        console.warn("Cannot display suggestion, no active editor known.");
        return;
    }
    
    // Clean the suggestion text (remove code markdown if present)
    const cleanedSuggestion = cleanCodeSuggestion(suggestionText);
    console.log("Attempting to display suggestion:", cleanedSuggestion);
    currentSuggestion = cleanedSuggestion; // Store the cleaned text

    suggestionElement = document.createElement('span');
    suggestionElement.className = 'labassistant-suggestion-overlay';
    // Basic multi-line handling (replace newline with <br>, use pre-wrap)
    suggestionElement.innerHTML = cleanedSuggestion.replace(/\n/g, '<br>');
    suggestionElement.style.whiteSpace = 'pre-wrap'; // Honor newlines and spaces

    // --- Improved Positioning Attempt ---
    const cmElement = lastActiveEditor; // CodeMirror wrapper element
    const editorRect = cmElement.getBoundingClientRect();
    
    // Try to find cursor and position relative to it
    let cursorElement = cmElement.querySelector('.CodeMirror-cursor');
    let cursorRect = null;
    let cursorLine = null;
    
    // Find the active line to position relative to it
    const activeLines = cmElement.querySelectorAll('.CodeMirror-activeline');
    if (activeLines.length > 0) {
        console.log("Found active line element:", activeLines[0]);
        cursorLine = activeLines[0];
    }
    
    // If we found a cursor element, get its position
    if (cursorElement && cursorElement.getBoundingClientRect) {
        cursorRect = cursorElement.getBoundingClientRect();
        console.log("Found cursor element at coordinates:", 
                    "left:", cursorRect.left, "top:", cursorRect.top);
    }
    
    // Position the suggestion element
    if (cursorRect || cursorLine) {
        // Try to add to the editor container for proper relative positioning
        const activeCell = cmElement.closest('.jp-CodeCell.jp-mod-active');
        const editorContainer = cmElement.closest('.jp-Editor, .jp-CodeMirrorEditor');
        
        if (editorContainer) {
            // First try to append it directly to editor container with absolute positioning
            editorContainer.appendChild(suggestionElement);
            suggestionElement.style.position = 'absolute'; // Position absolutely within editor
            
            if (cursorRect) {
                // Position relative to cursor if found
                const containerRect = editorContainer.getBoundingClientRect();
                suggestionElement.style.left = (cursorRect.left - containerRect.left) + 'px';
                suggestionElement.style.top = (cursorRect.top - containerRect.top) + 'px';
                console.log("Positioned relative to cursor");
            } else if (cursorLine) {
                // Position at end of active line if cursor not found
                const lineRect = cursorLine.getBoundingClientRect();
                const containerRect = editorContainer.getBoundingClientRect();
                suggestionElement.style.left = (lineRect.left - containerRect.left + lineRect.width) + 'px';
                suggestionElement.style.top = (lineRect.top - containerRect.top) + 'px';
                console.log("Positioned at end of active line");
            }
        } else if (activeCell) {
            // Fallback: append to active cell
            activeCell.appendChild(suggestionElement);
            console.log("Appended to active cell (fallback)");
        } else {
            // Last resort - add to body with fixed positioning
            document.body.appendChild(suggestionElement);
            suggestionElement.style.position = 'fixed';
            if (cursorRect) {
                suggestionElement.style.left = cursorRect.left + 'px';
                suggestionElement.style.top = cursorRect.top + 'px';
            } else {
                // Position in visible area as last resort
                suggestionElement.style.left = '50%';
                suggestionElement.style.top = '50%';
            }
            console.log("Added to body with absolute positioning (last resort)");
        }
    } else {
        // If we couldn't find cursor or active line, fallback to previous method
        console.warn("Could not find cursor or active line for positioning.");
        const activeCell = cmElement.closest('.jp-CodeCell.jp-mod-active');
        if (activeCell) {
            const editorContainer = cmElement.closest('.jp-Editor');
            if(editorContainer) {
                editorContainer.parentNode.insertBefore(suggestionElement, editorContainer.nextSibling);
                console.log("Suggestion element appended after editor container (fallback).");
            } else {
                activeCell.appendChild(suggestionElement);
                console.log("Appended to active cell (fallback)");
            }
        } else {
            console.warn("Could not find active cell to append suggestion.");
            document.body.appendChild(suggestionElement);
            console.log("Added to body (last resort)");
        }
    }
     // --- End Positioning Attempt ---

     console.log("Suggestion displayed (positioning may be basic).");

}


// Function to show error banner
function showErrorBanner(errorMessage) {
    console.log("Showing error banner:", errorMessage);
    let banner = document.getElementById('labassistant-error-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'labassistant-error-banner';
        document.body.appendChild(banner);
    }
    banner.textContent = `LabAssistant Error: ${errorMessage}`;
    banner.style.display = 'block'; // Make sure it's visible

    // Fade out after a few seconds
    setTimeout(() => {
        banner.style.display = 'none';
        console.log("Hiding error banner.");
    }, 5000); // Hide after 5 seconds
}

// Function to handle keyup events in the editor
function handleKeyUp(event) {
    // Ignore modifier keys by themselves
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape'].includes(event.key)) {
        return;
    }

    // Clear existing suggestion timer and dismiss visual suggestion
    if (suggestionTimeout) {
        clearTimeout(suggestionTimeout);
    }
    dismissSuggestion(); // Dismiss on any typing

    // Start new timer
    suggestionTimeout = setTimeout(() => {
        if (!lastActiveEditor) return;

        console.log(`Typing stopped for ${currentDelay}ms. Requesting suggestion.`);
        // This is a simplified way to get content. Prefers CodeMirror API if accessible.
        const codeMirrorLines = lastActiveEditor.querySelectorAll('.CodeMirror-line');
        let currentCode = '';
        if (codeMirrorLines.length > 0) {
             currentCode = Array.from(codeMirrorLines).map(line => line.textContent).join('\n');
        } else {
             // Fallback if lines aren't found (less likely for CM)
            currentCode = lastActiveEditor.textContent;
        }


        if (currentCode) { // Only request if there's code
            console.log("Sending code to background:", currentCode.substring(0, 100) + "..."); // Log snippet
             chrome.runtime.sendMessage({ type: 'getCodeSuggestion', code: currentCode })
                 .catch(error => console.error("Error sending message to background:", error));
        } else {
             console.log("No code in editor, not requesting suggestion.");
        }

    }, currentDelay); // Use delay from settings
}


// Function to inject a script into page context to access CodeMirror API directly
function injectScript(func) {
    const scriptContent = `(${func.toString()})();`;
    const script = document.createElement('script');
    script.textContent = scriptContent;
    document.documentElement.appendChild(script);
    script.remove();
}

// Function to attempt inserting the suggestion
function acceptSuggestion() {
    if (!currentSuggestion || !lastActiveEditor) {
        console.log("No suggestion active to accept or no active editor.");
        return;
    }
    
    console.log("Accepting suggestion:", currentSuggestion);

    try {
        // Setup communication channel between content script and page script
        window.addEventListener('message', function(event) {
            if (event.data && event.data.type === 'LABASSISTANT_INSERTION_RESULT') {
                console.log('Received insertion result:', event.data.success ? 'SUCCESS' : 'FAILED');
                if (!event.data.success) {
                    console.error('Insertion error:', event.data.error);
                    // Fall back to clipboard copy if insertion fails
                    copyToClipboardWithNotification();
                }
            }
        }, { once: true }); // Only listen once
        
        // Try multiple methods to insert code
        
        // 1. First attempt: Try using document.execCommand to simulate typing
        if (document.activeElement && 
            (document.activeElement.tagName === 'TEXTAREA' || 
             document.activeElement.tagName === 'INPUT' || 
             document.activeElement.isContentEditable)) {
            
            console.log("Attempting insertion via execCommand");
            document.execCommand('insertText', false, currentSuggestion);
            console.log("execCommand insertion attempt completed");
        } 
        // 2. Second attempt: Inject script to access CodeMirror directly
        else {
            console.log("Attempting injection of CodeMirror accessor script");
            // Pass the suggestion to the page context via a data attribute
            const dataContainer = document.createElement('div');
            dataContainer.id = 'labassistant-data-container';
            dataContainer.dataset.suggestion = currentSuggestion;
            dataContainer.style.display = 'none';
            document.body.appendChild(dataContainer);
            
            // Inject script to try various CodeMirror access methods
            injectScript(function() {
                try {
                    // Get our data
                    const container = document.getElementById('labassistant-data-container');
                    const suggestion = container?.dataset?.suggestion;
                    container.remove(); // Clean up
                    
                    if (!suggestion) {
                        window.postMessage({ type: 'LABASSISTANT_INSERTION_RESULT', success: false, error: 'No suggestion data found' }, '*');
                        return;
                    }
                    
                    // Try to find active CodeMirror instance
                    let editor = null;
                    
                    // Try different methods to get editor
                    const activeElement = document.activeElement;
                    const activeCellElement = activeElement?.closest('.jp-CodeCell.jp-mod-active');
                    const cmElement = activeElement?.closest('.CodeMirror') || 
                                      activeCellElement?.querySelector('.CodeMirror');
                                      
                    // For CodeMirror 5 (traditional Jupyter notebooks)
                    if (cmElement && cmElement.CodeMirror) {
                        editor = cmElement.CodeMirror;
                    }
                    // For CodeMirror 6 (newer Jupyter versions)
                    else if (window.jupyterapp && window.jupyterapp.shell) {
                        // Try to access through Jupyter API if available
                        const activeWidget = window.jupyterapp.shell.currentWidget;
                        if (activeWidget && activeWidget.editor) {
                            editor = activeWidget.editor;
                        }
                    }
                    
                    if (editor) {
                        if (typeof editor.replaceSelection === 'function') {
                            // CodeMirror 5 API
                            editor.replaceSelection(suggestion);
                            window.postMessage({ type: 'LABASSISTANT_INSERTION_RESULT', success: true }, '*');
                        } else if (typeof editor.dispatch === 'function') {
                            // CodeMirror 6 API
                            editor.dispatch({ insertText: suggestion });
                            window.postMessage({ type: 'LABASSISTANT_INSERTION_RESULT', success: true }, '*');
                        } else {
                            window.postMessage({ 
                                type: 'LABASSISTANT_INSERTION_RESULT', 
                                success: false, 
                                error: 'Found editor but API methods not available' 
                            }, '*');
                        }
                    } else {
                        window.postMessage({ 
                            type: 'COPILOT_INSERTION_RESULT', 
                            success: false, 
                            error: 'Could not find active CodeMirror editor' 
                        }, '*');
                    }
                } catch (err) {
                    window.postMessage({ 
                        type: 'COPILOT_INSERTION_RESULT', 
                        success: false, 
                        error: err.toString() 
                    }, '*');
                }
            });
        }
        
        // Show a notification that insertion was attempted
        showAcceptNotification();
        
    } catch (err) {
        console.error("Error trying to accept suggestion:", err);
        // Fallback to clipboard
        copyToClipboardWithNotification();
    }
    
    // Clean up
    dismissSuggestion();
}

// Function to show a notification when code is accepted
function showAcceptNotification() {
    const notification = document.createElement('div');
    notification.className = 'labassistant-notification';
    notification.textContent = 'Code inserted!';
    document.body.appendChild(notification);
    
    // Fade out and remove after a short time
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 1500);
}

// Function to copy suggestion to clipboard with notification
function copyToClipboardWithNotification() {
    navigator.clipboard.writeText(currentSuggestion).then(() => {
        console.log("Suggestion copied to clipboard as fallback.");
        
        const notification = document.createElement('div');
        notification.className = 'labassistant-notification';
        notification.textContent = 'Suggestion copied to clipboard';
        document.body.appendChild(notification);
        
        // Fade out and remove after a short time
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 500);
        }, 1500);
    }).catch(err => {
        console.error("Failed to copy suggestion to clipboard:", err);
    });
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Content script received message:", request);
    if (request.type === 'suggestionResult') {
        displaySuggestion(request.suggestion);
    } else if (request.type === 'suggestionError') {
        showErrorBanner(request.error);
         dismissSuggestion(); // Dismiss any current suggestion on error
    } else if (request.type === 'executeAcceptSuggestion') {
        acceptSuggestion();
    }
});

// --- Editor Focus and Event Handling ---

// Debounce function to prevent rapid firing of focus checks
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}


const checkFocus = debounce(() => {
    const activeElement = document.activeElement;
    console.log("Focus check - Active element:", activeElement?.tagName, 
                activeElement?.className, 
                "Document active:", document.hasFocus());
    
    // Check if focus is inside a CodeMirror instance within an active Jupyter code cell
    // Try multiple selectors for CodeMirror
    let codeMirrorEditor = null;
    
    // Try different selectors in order of specificity
    const cmSelectors = [
        '.jp-CodeCell.jp-mod-active .CodeMirror',
        '.jp-NotebookPanel .jp-CodeCell.jp-mod-active .CodeMirror',
        '.jp-CodeMirror-Editor',
        '.cm-editor',  // CodeMirror 6 selector
        '.CodeMirror'
    ];
    
    // Try each selector
    for (const selector of cmSelectors) {
        if (activeElement?.closest(selector)) {
            codeMirrorEditor = activeElement.closest(selector);
            console.log(`Found editor with selector: ${selector}`);
            break;
        }
    }
    
    // Alternative: also check if the active element itself is or contains an editor
    if (!codeMirrorEditor) {
        if (activeElement?.classList?.contains('CodeMirror') || 
            activeElement?.classList?.contains('cm-editor')) {
            codeMirrorEditor = activeElement;
            console.log("Active element itself is a CodeMirror editor");
        }
    }

    if (codeMirrorEditor) {
        if (codeMirrorEditor !== lastActiveEditor) {
             // Detach from old editor if necessary
            if (lastActiveEditor) {
                console.log("Detaching listener from old editor.");
                lastActiveEditor.removeEventListener('keyup', handleKeyUp);
                lastActiveEditor.removeEventListener('focusout', handleFocusOut); // Add focusout handler
            }

             // Attach to new editor
            console.log("Detected focus in CodeMirror editor. Attaching listener.", codeMirrorEditor);
            lastActiveEditor = codeMirrorEditor;
            lastActiveEditor.addEventListener('keyup', handleKeyUp);
            lastActiveEditor.addEventListener('focusout', handleFocusOut); // Add focusout handler

             // Also dismiss suggestion if focus changes *between* editors
             dismissSuggestion();
        }
        // Else: Focus is still within the same editor, do nothing special
    } else {
        // Focus is not in a known code editor
        if (lastActiveEditor) {
            console.log("Focus lost from tracked editor.");
            // Don't detach listener immediately on blur, but clear suggestion
            dismissSuggestion();
            // We could detach here, but maybe user clicks back quickly.
            // Let focusin handle re-attaching.
            // lastActiveEditor.removeEventListener('keyup', handleKeyUp); // Reconsider detaching here
            // lastActiveEditor = null; // Maybe don't nullify immediately
        }
    }
}, 100); // Check focus shortly after events settle


// Handle focusout from the editor to dismiss suggestion
function handleFocusOut(event) {
     // Check if the new focused element is still within the same editor or related elements
     // Use setTimeout to allow focus to shift before checking
     setTimeout(() => {
         if (!lastActiveEditor?.contains(document.activeElement)) {
             console.log("Focus moved out of the editor, dismissing suggestion.");
             dismissSuggestion();
              // Maybe detach listener fully here?
              if (lastActiveEditor) {
                  lastActiveEditor.removeEventListener('keyup', handleKeyUp);
                  lastActiveEditor.removeEventListener('focusout', handleFocusOut);
                  lastActiveEditor = null;
                  console.log("Detached listener on focus out.");
              }
         }
     }, 0);
}


// Listen for focus changes anywhere in the document
document.addEventListener('focusin', checkFocus, true); // Use capture phase

// Also listen for clicks, as focus might not change if clicking within same editor
document.addEventListener('click', (event) => {
     // If the click is outside the suggestion and outside the editor, dismiss.
     if (suggestionElement && !suggestionElement.contains(event.target) &&
         lastActiveEditor && !lastActiveEditor.contains(event.target)) {
         console.log("Clicked outside editor/suggestion, dismissing.");
         dismissSuggestion();
     }
     // Re-check focus in case click landed in an editor
     checkFocus();
}, true); // Use capture phase


// --- Initial Setup ---

// Load delay setting initially
chrome.storage.local.get({ delay: 500 }, (items) => { // Load with default
     if (chrome.runtime.lastError) {
        console.error("Content Script: Error loading delay setting:", chrome.runtime.lastError);
     } else {
        currentDelay = items.delay;
        console.log(`Content Script: Initial suggestion delay set to ${currentDelay}ms.`);
     }
});

// Listen for changes in storage (e.g., user saves new settings)
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.delay) {
        currentDelay = changes.delay.newValue;
        console.log(`Content Script: Suggestion delay updated to ${currentDelay}ms.`);
    }
    // Could update other settings live if needed
});

// Add DOM mutation observer to detect Jupyter notebook initialization
const bodyObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
            // Check if Jupyter notebook is now fully loaded (look for key elements)
            const jpCells = document.querySelectorAll('.jp-CodeCell');
            const cmEditors = document.querySelectorAll('.CodeMirror, .cm-editor');
            
            if (jpCells.length > 0 || cmEditors.length > 0) {
                console.log("Jupyter notebook structure detected!", 
                             "Cells:", jpCells.length, 
                             "Editors:", cmEditors.length);
                
                // Try manual focus check once notebook loads
                setTimeout(checkFocus, 1000);
            }
        }
    }
});

// Start observing the document body for changes
bodyObserver.observe(document.body, { childList: true, subtree: true });
console.log("DOM observer started to detect Jupyter notebook initialization");

// Error handling for runtime messaging
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    // Log all incoming messages for debugging
    console.log("Runtime message received in content script:", message);
    return true; // Keep channel open for async responses
});

// Add manual trigger for testing
window.addEventListener('keydown', function(e) {
    // Alt+Shift+D for debugging
    if (e.altKey && e.shiftKey && e.key === 'D') {
        console.log("Manual debug triggered with Alt+Shift+D");
        console.log("Current state:", {
            suggestionTimeout,
            currentSuggestion: currentSuggestion ? "[exists]" : null,
            suggestionElement: suggestionElement ? "[exists]" : null,
            lastActiveEditor: lastActiveEditor ? "[exists]" : null,
            currentDelay
        });
        
        // Log current DOM status
        console.log("Current DOM status:");
        console.log("  .jp-CodeCell elements:", document.querySelectorAll('.jp-CodeCell').length);
        console.log("  .CodeMirror elements:", document.querySelectorAll('.CodeMirror').length);
        
        // Manually trigger checkFocus
        checkFocus();
    }
});

