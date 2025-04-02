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
let currentDelay = 250; // Default delay (reduced from 500), will be updated from storage

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
    
    // Check if the text starts with a markdown code block indicator (```python, ```javascript, etc)
    const markdownStartRegex = /^```\w*\s*\n?/;
    // Check if the text ends with a markdown code block closing
    const markdownEndRegex = /\n?```$/;
    
    // Remove markdown code block syntax if present
    let cleanedText = text;
    
    // Remove starting markdown syntax if present
    if (markdownStartRegex.test(cleanedText)) {
        console.log("Removing markdown code block start");
        cleanedText = cleanedText.replace(markdownStartRegex, '');
    }
    
    // Remove ending markdown syntax if present
    if (markdownEndRegex.test(cleanedText)) {
        console.log("Removing markdown code block end");
        cleanedText = cleanedText.replace(markdownEndRegex, '');
    }
    
    // Check for full markdown code blocks (handling entire content as a code block)
    const fullMarkdownRegex = /^```\w*\s*\n?([\s\S]*?)\n?```$/;
    const match = text.match(fullMarkdownRegex);
    
    if (match && match[1]) {
        console.log("Removing full markdown code block wrapper");
        return match[1].trim();
    }
    
    return cleanedText.trim();
}

// Function to display the suggestion
// Robust positioning logic to ensure suggestions appear at the cursor position
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

    // Format multiline suggestions properly
    const formattedSuggestion = formatSuggestionWithLineBreaks(cleanedSuggestion);
    
    suggestionElement = document.createElement('span');
    suggestionElement.className = 'labassistant-suggestion-overlay';
    
    // Handle multiline formatting properly using pre element to preserve exact code formatting
    suggestionElement.innerHTML = formattedSuggestion;
    suggestionElement.style.whiteSpace = 'pre'; // Honor newlines and spaces exactly

    // Function to properly format suggestions with line breaks
    function formatSuggestionWithLineBreaks(suggestion) {
        // If suggestion contains newlines, format it properly for display
        if (suggestion.includes('\n')) {
            console.log("Suggestion contains line breaks, formatting as multiline");
            // Format as HTML with proper line breaks
            return suggestion.split('\n').map(line => {
                // Escape HTML entities to prevent XSS
                const escapedLine = line.replace(/&/g, '&amp;')
                                       .replace(/</g, '&lt;')
                                       .replace(/>/g, '&gt;')
                                       .replace(/"/g, '&quot;')
                                       .replace(/'/g, '&#039;');
                return escapedLine;
            }).join('<br>');
        } else {
            // Single line, just escape any HTML
            return suggestion.replace(/&/g, '&amp;')
                           .replace(/</g, '&lt;')
                           .replace(/>/g, '&gt;')
                           .replace(/"/g, '&quot;')
                           .replace(/'/g, '&#039;');
        }
    }
    
    // --- Completely Redesigned Positioning Logic ---
    
    // Get a reference to the entire notebook
    const notebookContainer = document.querySelector('.jp-Notebook-container, .notebook-container');
    
    // Use the most focused element we can find to determine cursor position
    const activeCell = document.querySelector('.jp-CodeCell.jp-mod-active');
    if (!activeCell) {
        console.warn("No active cell found");
        return; // Can't position without an active cell
    }
    
    // Find the current cursor position within the active cell
    // 1. Try to find the cursor element directly
    const cursorElement = activeCell.querySelector('.CodeMirror-cursor');
    
    // 2. Find the active line which should contain the cursor
    const activeLineElement = activeCell.querySelector('.CodeMirror-activeline');
    
    // Find the editor container for positioning
    const editorContainer = activeCell.querySelector('.jp-Editor, .jp-CodeMirrorEditor, .CodeMirror');
    
    // Target where we'll add our suggestion
    const targetContainer = editorContainer || activeCell;
    
    // Get the cursor X and Y position
    let cursorX = 0;
    let cursorY = 0;
    let foundCursor = false;
    
    // Find where the cursor position is by using the most reliable method available
    if (cursorElement && cursorElement.getBoundingClientRect) {
        // Method 1: Direct cursor detection - most accurate
        const rect = cursorElement.getBoundingClientRect();
        cursorX = rect.left + (rect.width || 1); // Position after cursor
        cursorY = rect.top;
        foundCursor = true;
        console.log("Found cursor directly at:", cursorX, cursorY);
    } 
    else if (activeLineElement) {
        // Method 2: Look at active line and try to determine cursor position
        const lineContent = activeLineElement.querySelector('.CodeMirror-line');
        if (lineContent) {
            const lineRect = lineContent.getBoundingClientRect();
            // Look for focused element or blinking cursor
            const focusedElements = activeLineElement.querySelectorAll(':focus, .CodeMirror-focused');
            
            // Take the active line position and try to determine cursor position
            // Look at the last text node or element in the line
            const lineElements = activeLineElement.querySelectorAll('.CodeMirror-line > span, .CodeMirror-line > pre');
            
            if (lineElements.length > 0) {
                // Get the last element which might contain the end of text
                const lastElement = lineElements[lineElements.length - 1];
                const lastElementRect = lastElement.getBoundingClientRect();
                
                cursorX = lastElementRect.right; // Position at the end of the text
                cursorY = lineRect.top;
                foundCursor = true;
                console.log("Found cursor position using active line:", cursorX, cursorY);
            } else {
                // Fallback to start of line if no specific elements found
                cursorX = lineRect.left;
                cursorY = lineRect.top;
                foundCursor = true;
                console.log("Using active line start as fallback:", cursorX, cursorY);
            }
        }
    }
    
    // Method 3: Last resort - find visible text elements and assume cursor is at the bottom
    if (!foundCursor) {
        // Try to find any visible text in the editor
        const textElements = activeCell.querySelectorAll('.CodeMirror-line');
        
        if (textElements.length > 0) {
            // Assume cursor might be at the last visible line
            const lastVisibleLine = textElements[textElements.length - 1];
            const rect = lastVisibleLine.getBoundingClientRect();
            
            cursorX = rect.left; // Position at start of line
            cursorY = rect.bottom; // Position at bottom of last line
            foundCursor = true;
            console.log("Using last visible line as extreme fallback:", cursorX, cursorY);
        }
    }
    
    // If we found a cursor position, proceed with positioning
    if (foundCursor) {
        // 1. Append the element to the appropriate container
        targetContainer.appendChild(suggestionElement);
        
        // 2. Set up absolute positioning within the cell
        suggestionElement.style.position = 'absolute';
        
        // 3. Calculate and set the position relative to container
        const containerRect = targetContainer.getBoundingClientRect();
        
        // Adjust position to be exactly where cursor is
        // The key is making the suggestion appear exactly where the user is typing
        const leftPosition = cursorX - containerRect.left;
        const topPosition = cursorY - containerRect.top;
        
        // Apply the position
        suggestionElement.style.left = leftPosition + 'px';
        suggestionElement.style.top = topPosition + 'px';
        
        console.log("Positioned suggestion at cursor location:", leftPosition, topPosition);
        console.log("Positioned suggestion precisely at cursor position");
    } else {
        // If we couldn't find a cursor position, try putting it in a reasonable location
        console.error("Failed to determine cursor position");
        
        // Place suggestion in the active cell at a visible location
        if (activeCell) {
            activeCell.appendChild(suggestionElement);
            suggestionElement.style.position = 'absolute';
            
            // Try to find any code/text in the cell
            const codeArea = activeCell.querySelector('.CodeMirror-code');
            if (codeArea) {
                // Position near the code
                const codeRect = codeArea.getBoundingClientRect();
                const cellRect = activeCell.getBoundingClientRect();
                
                suggestionElement.style.left = (codeRect.left - cellRect.left + 20) + 'px';
                suggestionElement.style.top = (codeRect.bottom - cellRect.top - 20) + 'px';
            } else {
                // Center in cell
                suggestionElement.style.left = '50%';
                suggestionElement.style.top = '50%';
                suggestionElement.style.transform = 'translate(-50%, -50%)';
            }
        } else {
            // Ultimate fallback - add to body
            document.body.appendChild(suggestionElement);
            suggestionElement.style.position = 'fixed';
            suggestionElement.style.left = '50%';
            suggestionElement.style.top = '50%';
            suggestionElement.style.transform = 'translate(-50%, -50%)';
        }
    }
    
    // Add a debug outline to help visualize the suggestion boundaries during development
    // suggestionElement.style.outline = '1px solid red'; // Uncomment for debugging
    
    // Make sure the suggestion doesn't have unwanted styles inherited
    suggestionElement.style.zIndex = '1000'; // Ensure it's above other elements
    suggestionElement.style.backgroundColor = 'rgba(255,255,255,0.7)'; // More transparent background
    suggestionElement.style.padding = '0'; // Remove padding for tighter text alignment
    suggestionElement.style.margin = '0'; // Reset margins
    suggestionElement.style.border = 'none'; // No borders
    suggestionElement.style.borderRadius = '2px';
    suggestionElement.style.fontSize = 'inherit'; // Match editor font size
    suggestionElement.style.fontFamily = 'monospace'; // Use monospace font like the editor
    suggestionElement.style.color = '#777'; // Subtle gray color for suggestion
    suggestionElement.style.whiteSpace = 'pre'; // Preserve whitespace exactly
    suggestionElement.style.display = 'inline-block'; // Better text handling
    suggestionElement.style.textIndent = '0'; // No text indentation
    suggestionElement.style.lineHeight = 'inherit'; // Match editor line height
    
    // Add debugging outline to help troubleshoot positioning
    // suggestionElement.style.outline = '1px solid red';
    
    console.log("Enhanced suggestion display complete");
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
        // Only display the suggestion if it's not trying to inject a code block marker
        // that wasn't in the original message (we only want to display completions, not introduce markers)
        const containsMarkdownMarker = /```python|```jupyter|```sql|```bash|```/i.test(request.suggestion);
        if (!containsMarkdownMarker || request.originalContainedMarker) {
            displaySuggestion(request.suggestion);
        } else {
            console.log("Skipping suggestion as it contains markdown markers that weren't in the original code");
            // Don't show suggestions that want to add markdown markers
        }
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

