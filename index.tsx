/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI } from '@google/genai';
import * as htmlToImage from 'html-to-image';

// --- Type Definitions ---
interface HistoryEntry {
    id: string;
    template: string;
    persona: string;
    topic: string;
    tone: string;
    includeHashtags: boolean;
    includeQuestion: boolean;
    generatedText: string;
}

// --- DOM Elements ---
const promptForm = document.getElementById('prompt-form') as HTMLFormElement;
const personaInput = document.getElementById('persona-input') as HTMLInputElement;
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
const buttonText = document.querySelector('#generate-button .button-text') as HTMLSpanElement;
const generateSpinner = document.querySelector('#generate-button .spinner') as HTMLDivElement;
const hashtagsCheckbox = document.getElementById('hashtags-checkbox') as HTMLInputElement;
const questionCheckbox = document.getElementById('question-checkbox') as HTMLInputElement;
const templateSelect = document.getElementById('template-select') as HTMLSelectElement;

// Preview Card
const postCard = document.getElementById('post-card') as HTMLDivElement;
const resultDiv = document.getElementById('result') as HTMLDivElement;
const copyButton = document.getElementById('copy-button') as HTMLButtonElement;
const regenerateButton = document.getElementById('regenerate-button') as HTMLButtonElement;
const exportPngButton = document.getElementById('export-png-button') as HTMLButtonElement;
const profileName = document.getElementById('profile-name') as HTMLSpanElement;
const profileDesc = document.getElementById('profile-desc') as HTMLSpanElement;
const previewPlaceholder = document.getElementById('preview-placeholder') as HTMLDivElement;
const previewSpinner = document.getElementById('preview-spinner') as HTMLDivElement;
const wordCountEl = document.getElementById('word-count') as HTMLSpanElement;
const charCountEl = document.getElementById('character-count') as HTMLSpanElement;
const actionsMenu = document.querySelector('.actions-menu') as HTMLDetailsElement;

// History Panel
const historyPanel = document.getElementById('history-panel') as HTMLElement;
const contentWrapper = document.querySelector('.content-wrapper') as HTMLElement;
const toggleHistoryButton = document.getElementById('toggle-history-button') as HTMLButtonElement;
const historyList = document.getElementById('history-list') as HTMLUListElement;
const clearHistoryButton = document.getElementById('clear-history-button') as HTMLButtonElement;
const historySearchInput = document.getElementById('history-search-input') as HTMLInputElement;

// --- Templates ---
const templates = [
    { id: 'custom', title: 'Custom Topic', placeholder: 'e.g., The importance of mentorship in career growth' },
    { id: 'achievement', title: 'Share an Achievement', placeholder: 'Describe a recent accomplishment. What was the challenge, what did you do, and what was the result? What did you learn?' },
    { id: 'lesson_learned', title: 'Reflect on a Lesson Learned', placeholder: 'Describe a recent failure or mistake. What happened, what did you learn from it, and what advice would you give others?' },
    { id: 'new_project', title: 'Announce a New Project', placeholder: 'Introduce a new project you are working on. What is it, what problem does it solve, and what are you excited about?' },
    { id: 'ask_question', title: 'Ask a Question to Your Network', placeholder: 'Pose a question to your network to start a conversation. e.g., "What\'s the best piece of career advice you\'ve ever received?"' }
];

// --- State Management ---
let isLoading = false;
let history: HistoryEntry[] = [];
let activeHistoryId: string | null = null;
const HISTORY_STORAGE_KEY = 'contentrelay-post-history';
const HISTORY_COLLAPSED_KEY = 'contentrelay-history-collapsed';

const setLoading = (loading: boolean) => {
    isLoading = loading;
    generateButton.disabled = loading;
    promptInput.disabled = loading;
    personaInput.disabled = loading;
    templateSelect.disabled = loading;
    generateSpinner.style.display = loading ? 'block' : 'none';
    previewSpinner.style.display = loading ? 'flex' : 'none';
    
    if (loading) {
        buttonText.textContent = 'Generating...';
        previewPlaceholder.style.display = 'none';
        postCard.style.display = 'none';
        actionsMenu.style.display = 'none';
    } else {
        buttonText.textContent = 'Generate Post';
    }
};

const updateProfilePreview = () => {
    const personaText = personaInput.value;
    if (!personaText) {
        profileName.textContent = 'Your Name';
        profileDesc.textContent = 'Your Title';
        return;
    }
    const [name, ...descParts] = personaText.split(/\||,/);
    profileName.textContent = name?.trim() || 'Your Name';
    profileDesc.textContent = descParts.join(',').trim() || 'Your Title';
};

const displayError = (message: string) => {
    resultDiv.textContent = message;
    resultDiv.classList.add('error');
    updateTextMetrics('');
    postCard.style.display = 'block';
    previewPlaceholder.style.display = 'none';
    actionsMenu.style.display = 'none';
};

// --- Text Metrics ---
const updateTextMetrics = (text: string) => {
    if (!wordCountEl || !charCountEl) return;
    const trimmedText = text.trim();
    const words = trimmedText.split(/\s+/).filter(Boolean);
    wordCountEl.textContent = `${words.length} words`;
    charCountEl.textContent = `${trimmedText.length} characters`;
};

// --- History Panel Management ---
const setHistoryPanelCollapsed = (collapsed: boolean) => {
    historyPanel.classList.toggle('collapsed', collapsed);
    contentWrapper.classList.toggle('history-collapsed', collapsed);
    try {
        localStorage.setItem(HISTORY_COLLAPSED_KEY, JSON.stringify(collapsed));
    } catch (e) {
        console.error("Could not save history collapsed state", e);
    }
};

const loadHistoryPanelState = () => {
    try {
        const collapsed = localStorage.getItem(HISTORY_COLLAPSED_KEY);
        if (collapsed) {
            setHistoryPanelCollapsed(JSON.parse(collapsed));
        }
    } catch (e) {
        console.error("Could not load history collapsed state", e);
    }
};

const saveHistory = () => {
    try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
        console.error("Could not save history to localStorage:", error);
    }
};

const loadHistory = () => {
    try {
        const storedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
        if (storedHistory) {
            history = JSON.parse(storedHistory);
        }
    } catch (error) {
        console.error("Could not load history from localStorage:", error);
        history = [];
    }
};

const renderHistory = (filteredHistory?: HistoryEntry[]) => {
    const itemsToRender = filteredHistory ?? history;
    historyList.innerHTML = '';

    if (itemsToRender.length === 0) {
        historyList.classList.add('is-empty');
        if (filteredHistory) { // This means it's a search with no results
             historyList.classList.add('no-results');
        } else {
             historyList.classList.remove('no-results');
        }
    } else {
        historyList.classList.remove('is-empty', 'no-results');
    }

    clearHistoryButton.style.display = history.length > 0 ? 'block' : 'none';

    itemsToRender.slice().reverse().forEach(item => {
        const li = document.createElement('li');
        li.className = 'history-item';
        li.textContent = item.topic;
        li.title = item.topic;
        if (item.id === activeHistoryId) {
            li.classList.add('active');
        }
        li.addEventListener('click', () => {
            if (isLoading || item.id === activeHistoryId) return;
            displayPost(item);
        });
        historyList.appendChild(li);
    });
};

const addToHistory = (entry: HistoryEntry) => {
    history.push(entry);
    if (history.length > 50) {
        history.shift();
    }
    activeHistoryId = entry.id;
    saveHistory();
    renderHistory();
};

const populateForm = (entry: HistoryEntry) => {
    templateSelect.value = entry.template;
    personaInput.value = entry.persona;
    promptInput.value = entry.topic;
    document.querySelector<HTMLInputElement>(`input[name="tone"][value="${entry.tone}"]`)!.checked = true;
    hashtagsCheckbox.checked = entry.includeHashtags;
    questionCheckbox.checked = entry.includeQuestion;
    updateProfilePreview();
};

const displayPost = (entry: HistoryEntry) => {
    populateForm(entry);
    
    resultDiv.textContent = entry.generatedText;
    updateTextMetrics(entry.generatedText);
    resultDiv.classList.remove('error');
    postCard.style.display = 'block';
    previewPlaceholder.style.display = 'none';
    previewSpinner.style.display = 'none';
    
    actionsMenu.style.display = 'block';

    activeHistoryId = entry.id;
    renderHistory();
}

// --- Template Management ---
const populateTemplates = () => {
    templates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.title;
        templateSelect.appendChild(option);
    });
    handleTemplateChange();
};

const handleTemplateChange = () => {
    const selectedTemplateId = templateSelect.value;
    const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
    if (selectedTemplate) {
        promptInput.placeholder = selectedTemplate.placeholder;
    }
};

const clearValidation = () => {
    personaInput.classList.remove('is-invalid');
    promptInput.classList.remove('is-invalid');
};

const validateForm = (): boolean => {
    clearValidation();
    let isValid = true;
    if (!personaInput.value.trim()) {
        personaInput.classList.add('is-invalid');
        isValid = false;
    }
    if (!promptInput.value.trim()) {
        promptInput.classList.add('is-invalid');
        isValid = false;
    }
    return isValid;
};

// --- API Call ---
const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

const generatePost = async (params: Omit<HistoryEntry, 'generatedText' | 'id'>) => {
    if (isLoading) return;
    setLoading(true);
    resultDiv.textContent = '';
    updateTextMetrics('');
    resultDiv.classList.remove('error');
    
    try {
        let rules = `
- The post must be under 250 words.
- Do not use any emojis.
- Maintain a professional and ${params.tone} tone.
- Write in the first-person.`;

        if (params.includeHashtags) {
            rules += '\n- Include 3 to 5 relevant and strategic hashtags at the end.';
        }
        if (params.includeQuestion) {
            rules += '\n- Always conclude with a thought-provoking question to drive engagement.';
        }

        const systemInstruction = `You are an expert content creator acting as: ${params.persona}. Your task is to write a compelling social media post. Follow all rules provided.`;
        const prompt = `Post Topic: "${params.topic}"\n\nStrict Rules:\n${rules}`;

        const stream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
            }
        });
        
        postCard.style.display = 'block';
        let fullText = '';
        for await (const chunk of stream) {
            fullText += chunk.text;
            resultDiv.textContent = fullText;
            updateTextMetrics(fullText);
        }

        if (fullText.trim()) {
            actionsMenu.style.display = 'block';
            
            const newEntry: HistoryEntry = { ...params, id: Date.now().toString(), generatedText: fullText };
            addToHistory(newEntry);
        }

    } catch (error) {
        console.error(error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        displayError(`Failed to generate post. ${errorMessage}`);
    } finally {
        setLoading(false);
        if (!resultDiv.textContent?.trim() && !resultDiv.classList.contains('error')) {
            previewPlaceholder.style.display = 'flex';
            postCard.style.display = 'none';
        }
    }
};

const resetAppUI = () => {
    promptForm.reset();
    handleTemplateChange();
    updateProfilePreview();
    clearValidation();
    activeHistoryId = null;
    previewPlaceholder.style.display = 'flex';
    postCard.style.display = 'none';
    resultDiv.classList.remove('error');
    resultDiv.textContent = '';
    updateTextMetrics('');
};

// --- Event Listeners ---
personaInput.addEventListener('input', () => {
    personaInput.classList.remove('is-invalid');
    updateProfilePreview();
});
promptInput.addEventListener('input', () => {
    promptInput.classList.remove('is-invalid');
});
templateSelect.addEventListener('change', handleTemplateChange);
resultDiv.addEventListener('input', () => {
    updateTextMetrics(resultDiv.textContent || '');
});

promptForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm()) {
        return;
    }
    
    const params = {
        template: templateSelect.value,
        persona: personaInput.value.trim(),
        topic: promptInput.value.trim(),
        tone: (document.querySelector('input[name="tone"]:checked') as HTMLInputElement).value,
        includeHashtags: hashtagsCheckbox.checked,
        includeQuestion: questionCheckbox.checked,
    };
    await generatePost(params);
});

regenerateButton.addEventListener('click', async () => {
    actionsMenu.removeAttribute('open');
    const activeEntry = history.find(entry => entry.id === activeHistoryId);
    if (activeEntry) {
        const { id, generatedText, ...params } = activeEntry;
        await generatePost(params);
    }
});

copyButton.addEventListener('click', () => {
    actionsMenu.removeAttribute('open');
    if (navigator.clipboard && resultDiv.textContent) {
        navigator.clipboard.writeText(resultDiv.textContent)
            .then(() => {
                // Visual feedback can be added here if desired
                console.log('Text copied!');
            })
            .catch(err => {
                console.error('Failed to copy text: ', err);
                alert('Failed to copy text.');
            });
    }
});

exportPngButton.addEventListener('click', async () => {
    actionsMenu.removeAttribute('open');
    postCard.classList.add('exporting');
    try {
        const dataUrl = await htmlToImage.toPng(postCard, {
            quality: 1.0,
            pixelRatio: 2, // For higher resolution
            backgroundColor: '#ffffff' // Ensure background is solid
        });
        const link = document.createElement('a');
        link.download = `contentrelay-post-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
    } catch (error) {
        console.error('oops, something went wrong!', error);
        alert('Failed to export image.');
    } finally {
        postCard.classList.remove('exporting');
    }
});


clearHistoryButton.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all history? This cannot be undone.')) {
        history = [];
        saveHistory();
        resetAppUI();
        renderHistory();
    }
});

toggleHistoryButton.addEventListener('click', () => {
    const isCollapsed = historyPanel.classList.contains('collapsed');
    setHistoryPanelCollapsed(!isCollapsed);
});

historySearchInput.addEventListener('input', () => {
    const searchTerm = historySearchInput.value.toLowerCase();
    if (!searchTerm) {
        renderHistory();
        return;
    }
    const filtered = history.filter(item => 
        item.topic.toLowerCase().includes(searchTerm) || 
        item.persona.toLowerCase().includes(searchTerm)
    );
    renderHistory(filtered);
});

// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    populateTemplates();
    loadHistory();
    renderHistory();
    updateProfilePreview();
    loadHistoryPanelState();
});