// Firebase and storage configuration
let db = null;
let firebaseApp = null;

// Storage keys (kept for backward compatibility during migration)
const STORAGE_KEY = 'homeTasks';
const HISTORY_KEY = 'taskHistory';
const CYCLE_START_KEY = 'cycleStartDate';

let schedule = null;
const CYCLE_LENGTH_WEEKS = 12;

// Reference date for calculating week in cycle (January 1, 2024 = Week 1)
const REFERENCE_DATE = new Date('2024-01-01');

// Toast notification system
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    
    // Show toast
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Hide after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Update loading screen status
function updateLoadingStatus(message) {
    const statusElement = document.querySelector('.loading-status');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

// Hide loading screen and show app
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    const container = document.querySelector('.container');
    
    loadingScreen.classList.add('hidden');
    container.style.display = 'block';
    
    // Remove loading screen from DOM after animation
    setTimeout(() => {
        loadingScreen.remove();
    }, 500);
}

// Initialize Firebase
async function initializeFirebase() {
    try {
        updateLoadingStatus('Connecting to Firebase...');
        
        // Fetch Firebase config from server
        const response = await fetch('/api/config');
        const { firebaseConfig } = await response.json();
        
        console.log('🔧 Initializing Firebase with config:', firebaseConfig.projectId);
        updateLoadingStatus('Initializing database...');
        
        // Initialize Firebase app
        firebaseApp = firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        
        // Enable offline persistence (optional but helpful)
        try {
            await db.enablePersistence({ synchronizeTabs: true });
            console.log('💾 Firebase offline persistence enabled');
        } catch (err) {
            if (err.code === 'failed-precondition') {
                console.warn('⚠️ Multiple tabs open, persistence enabled in first tab only');
            } else if (err.code === 'unimplemented') {
                console.warn('⚠️ Browser does not support persistence');
            }
        }
        
        // Test connection with a simple read
        console.log('🔍 Testing Firebase connection...');
        updateLoadingStatus('Testing connection...');
        await db.collection('taskHistory').doc('shared').get();
        
        console.log('✅ Firebase initialized and connected successfully');
        return true;
    } catch (error) {
        console.error('❌ Error initializing Firebase:', error);
        console.error('Error details:', error.code, error.message);
        console.warn('⚠️ Falling back to localStorage');
        showToast('Using offline mode', 'info');
        return false;
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    updateLoadingStatus('Starting up...');
    
    await initializeFirebase();
    
    updateLoadingStatus('Loading schedule...');
    await loadSchedule();
    
    updateLoadingStatus('Setting up interface...');
    setupTabs();
    displayCurrentDate();
    renderTodaysTasks();
    renderWeeklyView();
    renderHistoryView();
    
    updateLoadingStatus('Loading your tasks...');
    await loadTaskStates();
    renderWeeklyView();
    renderHistoryView();
    
    updateLoadingStatus('Loading your tasks...');
    await loadTaskStates();
    
    // Listen for real-time updates from Firebase
    if (db) {
        setupRealtimeListeners();
    }
    
    // Hide loading screen and show app
    hideLoadingScreen();
});

// Calculate which week of the 12-week cycle we're in
function getCurrentWeekInCycle() {
    const today = new Date();
    const diffTime = Math.abs(today - REFERENCE_DATE);
    const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
    return (diffWeeks % CYCLE_LENGTH_WEEKS) + 1;
}

// Load the cleaning schedule from JSON
async function loadSchedule() {
    try {
        const response = await fetch('schedule.json');
        schedule = await response.json();
    } catch (error) {
        console.error('Error loading schedule:', error);
    }
}

// Setup tab switching
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and contents
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button
            button.classList.add('active');
            
            // Show corresponding content
            const tabName = button.getAttribute('data-tab');
            document.getElementById(`${tabName}-view`).classList.add('active');
        });
    });
}

// Display current date
function displayCurrentDate() {
    const dateElement = document.getElementById('current-date');
    const today = new Date();
    const weekNumber = getCurrentWeekInCycle();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateElement.textContent = `${today.toLocaleDateString('en-GB', options)} - Week ${weekNumber} of 12`;
}

// Get current day of week
function getCurrentDay() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
}

// Render today's tasks
function renderTodaysTasks() {
    if (!schedule) return;
    
    const currentDay = getCurrentDay();
    const weekNumber = getCurrentWeekInCycle();
    const dailyTasksList = document.getElementById('daily-tasks-list');
    const weeklyTasksList = document.getElementById('weekly-tasks-list');
    
    // Clear existing content
    dailyTasksList.innerHTML = '';
    weeklyTasksList.innerHTML = '';
    
    let dailyTotalMinutes = 0;
    let focusTotalMinutes = 0;
    
    // Render daily tasks
    schedule.daily_tasks.forEach((task, index) => {
        const taskId = `daily-${index}`;
        const taskElement = createTaskElement(task, taskId);
        dailyTasksList.appendChild(taskElement);
        dailyTotalMinutes += task.minutes || 0;
    });
    
    // Add time summary for daily tasks
    const dailySummary = document.createElement('div');
    dailySummary.style.cssText = 'margin-top: 10px; padding: 10px; background: rgba(102, 126, 234, 0.1); border-radius: 5px; text-align: center; font-weight: 500; color: #667eea;';
    dailySummary.textContent = `Total: ${dailyTotalMinutes} minutes`;
    dailyTasksList.appendChild(dailySummary);
    
    // Render today's focus task from the 12-week schedule
    const weekKey = `week_${weekNumber}`;
    const todaysTasks = schedule.twelve_week_schedule[weekKey][currentDay];
    
    if (todaysTasks && todaysTasks.length > 0) {
        todaysTasks.forEach((task, index) => {
            const taskId = `focus-week${weekNumber}-${currentDay}-${index}`;
            const taskElement = createTaskElement(task, taskId);
            weeklyTasksList.appendChild(taskElement);
            focusTotalMinutes += task.minutes || 0;
        });
        
        // Add time summary for focus tasks
        const focusSummary = document.createElement('div');
        focusSummary.style.cssText = 'margin-top: 10px; padding: 10px; background: rgba(102, 126, 234, 0.1); border-radius: 5px; text-align: center; font-weight: 500; color: #667eea;';
        focusSummary.textContent = `Total: ${focusTotalMinutes} minutes`;
        weeklyTasksList.appendChild(focusSummary);
        
        // Add grand total at the bottom
        const grandTotal = document.createElement('div');
        grandTotal.style.cssText = 'margin-top: 15px; padding: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; text-align: center; font-weight: bold; color: white; font-size: 1.1em;';
        grandTotal.textContent = `Today's Total: ${dailyTotalMinutes + focusTotalMinutes} minutes`;
        weeklyTasksList.appendChild(grandTotal);
    } else {
        weeklyTasksList.innerHTML = '<p style="color: #666; padding: 15px; text-align: center;">No focus tasks for today! 🎉</p>';
    }
}

// Create a task element
function createTaskElement(task, taskId) {
    const taskItem = document.createElement('div');
    taskItem.className = 'task-item';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-checkbox';
    checkbox.id = taskId;
    checkbox.setAttribute('data-task-id', taskId);
    checkbox.setAttribute('data-task-name', task.name);
    checkbox.setAttribute('data-task-location', task.location);
    checkbox.addEventListener('change', async () => {
        if (checkbox.checked) {
            await recordTaskCompletion(task.name, task.location);
        }
        await saveTaskStates();
    });
    
    const taskContent = document.createElement('div');
    taskContent.className = 'task-content';
    
    const taskName = document.createElement('label');
    taskName.className = 'task-name';
    taskName.htmlFor = taskId;
    taskName.textContent = task.name;
    
    const taskLocation = document.createElement('div');
    taskLocation.className = 'task-location';
    const minutes = task.minutes ? ` • ${task.minutes} min` : '';
    taskLocation.textContent = `📍 ${task.location}${minutes}`;
    
    taskContent.appendChild(taskName);
    taskContent.appendChild(taskLocation);
    
    taskItem.appendChild(checkbox);
    taskItem.appendChild(taskContent);
    
    return taskItem;
}

// Render weekly view
function renderWeeklyView() {
    if (!schedule) return;
    
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const currentDay = getCurrentDay();
    const weekNumber = getCurrentWeekInCycle();
    const weekKey = `week_${weekNumber}`;
    
    days.forEach(day => {
        const dayContainer = document.getElementById(`${day.toLowerCase()}-tasks`);
        const dayColumn = dayContainer.parentElement;
        
        // Highlight current day
        if (day === currentDay) {
            dayColumn.classList.add('today');
        }
        
        // Clear existing content
        dayContainer.innerHTML = '';
        
        let totalMinutes = 0;
        
        // Add daily tasks first (shown for every day)
        const dailyHeader = document.createElement('div');
        dailyHeader.style.fontWeight = 'bold';
        dailyHeader.style.marginBottom = '8px';
        dailyHeader.style.paddingBottom = '8px';
        dailyHeader.style.borderBottom = '1px solid rgba(255,255,255,0.2)';
        dailyHeader.textContent = 'Daily Tasks:';
        dayContainer.appendChild(dailyHeader);
        
        schedule.daily_tasks.forEach(task => {
            const taskElement = createWeeklyTaskElement(task);
            dayContainer.appendChild(taskElement);
            totalMinutes += task.minutes || 0;
        });
        
        // Add separator before focus tasks
        const separator = document.createElement('div');
        separator.style.marginTop = '12px';
        separator.style.marginBottom = '8px';
        separator.style.fontWeight = 'bold';
        separator.textContent = 'Focus Tasks:';
        dayContainer.appendChild(separator);
        
        // Add focus tasks for this day from current week
        const dayTasks = schedule.twelve_week_schedule[weekKey][day];
        
        if (dayTasks && dayTasks.length > 0) {
            dayTasks.forEach(task => {
                const taskElement = createWeeklyTaskElement(task);
                dayContainer.appendChild(taskElement);
                totalMinutes += task.minutes || 0;
            });
        } else {
            const noTasksText = document.createElement('p');
            noTasksText.style.color = '#999';
            noTasksText.style.fontSize = '0.9em';
            noTasksText.style.padding = '5px';
            noTasksText.textContent = 'No focus tasks';
            dayContainer.appendChild(noTasksText);
        }
        
        // Add time total at bottom
        const timeTotal = document.createElement('div');
        timeTotal.style.marginTop = '12px';
        timeTotal.style.paddingTop = '8px';
        timeTotal.style.borderTop = '1px solid rgba(255,255,255,0.2)';
        timeTotal.style.fontWeight = 'bold';
        timeTotal.style.color = '#FFD700';
        timeTotal.textContent = `Total: ${totalMinutes} min`;
        dayContainer.appendChild(timeTotal);
    });
}

// Record task completion in history
async function recordTaskCompletion(taskName, taskLocation) {
    const today = new Date().toISOString().split('T')[0];
    let history = await getTaskHistory();
    
    history[taskName] = {
        location: taskLocation,
        lastCompleted: today
    };
    
    // Clean up old history (keep only last 12 weeks)
    const twelveWeeksAgo = new Date();
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - (12 * 7));
    
    Object.keys(history).forEach(key => {
        const completedDate = new Date(history[key].lastCompleted);
        if (completedDate < twelveWeeksAgo) {
            delete history[key];
        }
    });
    
    // Save to Firebase or localStorage
    if (db) {
        try {
            await db.collection('taskHistory').doc('shared').set(history);
            // Task saved successfully - could show subtle feedback
        } catch (error) {
            console.error('Error saving history to Firebase:', error);
            showToast('Failed to sync task. Using offline mode.', 'error');
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        }
    } else {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }
}

// Get task history
async function getTaskHistory() {
    if (db) {
        try {
            const doc = await db.collection('taskHistory').doc('shared').get();
            return doc.exists ? doc.data() : {};
        } catch (error) {
            console.error('Error loading history from Firebase:', error);
            const saved = localStorage.getItem(HISTORY_KEY);
            return saved ? JSON.parse(saved) : {};
        }
    } else {
        const saved = localStorage.getItem(HISTORY_KEY);
        return saved ? JSON.parse(saved) : {};
    }
}

// Render history view organized by room
async function renderHistoryView() {
    if (!schedule) return;
    
    const historyContainer = document.getElementById('history-by-room');
    const history = await getTaskHistory();
    
    // Collect all unique tasks from schedule
    const allTasks = new Map();
    
    // Add daily tasks
    schedule.daily_tasks.forEach(task => {
        allTasks.set(task.name, task);
    });
    
    // Add all tasks from 12-week schedule
    Object.keys(schedule.twelve_week_schedule).forEach(weekKey => {
        const week = schedule.twelve_week_schedule[weekKey];
        Object.keys(week).forEach(day => {
            week[day].forEach(task => {
                allTasks.set(task.name, task);
            });
        });
    });
    
    // Organize tasks by location
    const tasksByLocation = {};
    allTasks.forEach((task, name) => {
        const location = task.location;
        if (!tasksByLocation[location]) {
            tasksByLocation[location] = [];
        }
        tasksByLocation[location].push({
            name: name,
            howOften: task.how_often,
            lastCompleted: history[name]?.lastCompleted || null
        });
    });
    
    // Clear container
    historyContainer.innerHTML = '';
    
    // Define room icons
    const roomIcons = {
        'Bedroom': '🛏️',
        'Kitchen': '🍳',
        'Main Bathroom': '🚿',
        'Ensuite Bathroom': '�',
        'Living Room / Office / Kitchen / Hallway': '🏠',
        'Living Room / Hallway': '🛋️',
        'Living Room': '🐠',
        'Hallway': '🚪',
        'All Rooms': '🏠',
        'Garage': '🚗',
        'Outside': '🗑️',
        'Kitchen / Main Bathroom / Ensuite / Hallway': '🧹',
        'Bedroom / Landing': '🪜'
    };
    
    // Render each location
    Object.keys(tasksByLocation).sort().forEach(location => {
        const roomSection = document.createElement('div');
        roomSection.className = 'room-section';
        
        const roomHeader = document.createElement('h3');
        const icon = roomIcons[location] || '📍';
        roomHeader.innerHTML = `<span class="room-icon">${icon}</span> ${location}`;
        
        const taskList = document.createElement('div');
        taskList.className = 'history-task-list';
        
        tasksByLocation[location].forEach(task => {
            const taskItem = createHistoryTaskElement(task);
            taskList.appendChild(taskItem);
        });
        
        roomSection.appendChild(roomHeader);
        roomSection.appendChild(taskList);
        historyContainer.appendChild(roomSection);
    });
}

// Find all occurrences of a task in the schedule (12-week rotation)
function findTaskOccurrences(taskName) {
    if (!schedule) return [];
    
    const occurrences = [];
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Check if it's a daily task
    const isDailyTask = schedule.daily_tasks.some(t => t.name === taskName);
    if (isDailyTask) {
        return [{ type: 'daily', frequency: 'Daily' }];
    }
    
    // Search through the 12-week schedule
    for (let weekNum = 1; weekNum <= 12; weekNum++) {
        const weekKey = `week_${weekNum}`;
        const week = schedule.twelve_week_schedule[weekKey];
        
        if (week) {
            Object.keys(week).forEach(dayName => {
                const tasks = week[dayName];
                const taskExists = tasks.some(t => t.name === taskName);
                
                if (taskExists) {
                    occurrences.push({
                        type: 'weekly',
                        week: weekNum,
                        dayName: dayName,
                        dayOfWeek: daysOfWeek.indexOf(dayName)
                    });
                }
            });
        }
    }
    
    return occurrences;
}

// Calculate the actual next scheduled date based on 12-week rotation
function getNextScheduledDate(task) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const occurrences = findTaskOccurrences(task.name);
    
    // If no occurrences found in schedule, fall back to frequency-based calculation
    if (occurrences.length === 0) {
        if (task.lastCompleted) {
            return { text: 'As needed', overdue: false };
        } else {
            return { text: 'Not scheduled', overdue: false };
        }
    }
    
    // Handle daily tasks
    if (occurrences[0].type === 'daily') {
        const nextDate = new Date(today);
        nextDate.setDate(nextDate.getDate() + 1);
        
        const dateStr = nextDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
        return { text: `Tomorrow (${dateStr})`, overdue: false };
    }
    
    // For weekly tasks, find the next occurrence in the 12-week cycle
    const currentWeek = getCurrentWeekInCycle();
    const nextOccurrences = [];
    
    // Calculate dates for all occurrences
    occurrences.forEach(occ => {
        const weeksUntil = (occ.week - currentWeek + 12) % 12;
        
        // Calculate the date for this occurrence
        let checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - checkDate.getDay() + occ.dayOfWeek); // Move to the day of week
        
        // If that day is in the past this week, move to next week
        if (checkDate <= today) {
            checkDate.setDate(checkDate.getDate() + 7);
        }
        
        // Add the weeks until the right week in the cycle
        if (weeksUntil > 0) {
            checkDate.setDate(checkDate.getDate() + (weeksUntil * 7));
        }
        
        nextOccurrences.push(checkDate);
    });
    
    // Sort to find the nearest occurrence
    nextOccurrences.sort((a, b) => a - b);
    const nextDate = nextOccurrences[0];
    
    // Calculate if overdue (based on last completed)
    let isOverdue = false;
    if (task.lastCompleted) {
        const lastCompleted = new Date(task.lastCompleted);
        lastCompleted.setHours(0, 0, 0, 0);
        
        // Find when it should have been done after last completion
        const daysSinceCompletion = Math.floor((today - lastCompleted) / (1000 * 60 * 60 * 24));
        
        // Calculate expected frequency in days based on occurrences
        const expectedFrequencyDays = Math.round((12 * 7) / occurrences.length);
        
        // Mark overdue if it's been longer than expected
        if (daysSinceCompletion > expectedFrequencyDays + 3) {
            isOverdue = true;
        }
    }
    
    // Format the result
    const diffTime = nextDate - today;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const dateStr = nextDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });
    
    if (diffDays === 0) {
        return { text: 'Due today', overdue: isOverdue };
    } else if (diffDays === 1) {
        return { text: `Tomorrow (${dateStr})`, overdue: isOverdue };
    } else if (diffDays <= 7) {
        const dayName = nextDate.toLocaleDateString('en-GB', { weekday: 'long' });
        return { text: `${dayName} (${dateStr})`, overdue: isOverdue };
    } else {
        return { text: `${dateStr}`, overdue: isOverdue };
    }
}

// Create a history task element
function createHistoryTaskElement(task) {
    const taskItem = document.createElement('div');
    taskItem.className = 'history-task-item';
    
    const taskInfo = document.createElement('div');
    taskInfo.className = 'history-task-info';
    
    const taskName = document.createElement('div');
    taskName.className = 'history-task-name';
    taskName.textContent = task.name;
    
    const taskFrequency = document.createElement('div');
    taskFrequency.className = 'history-task-frequency';
    taskFrequency.textContent = task.howOften;
    
    taskInfo.appendChild(taskName);
    taskInfo.appendChild(taskFrequency);
    
    const taskDate = document.createElement('div');
    taskDate.className = 'history-task-date';
    
    if (task.lastCompleted) {
        const lastDate = new Date(task.lastCompleted);
        const today = new Date();
        const diffTime = Math.abs(today - lastDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        const dateSpan = document.createElement('div');
        dateSpan.className = 'last-completed';
        dateSpan.textContent = 'Last: ' + lastDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });
        
        const daysSpan = document.createElement('div');
        daysSpan.className = 'days-ago';
        if (diffDays === 0) {
            daysSpan.textContent = '(Today)';
        } else if (diffDays === 1) {
            daysSpan.textContent = '(1 day ago)';
        } else {
            daysSpan.textContent = `(${diffDays} days ago)`;
        }
        
        // Add next scheduled date
        const nextScheduled = getNextScheduledDate(task);
        const nextSpan = document.createElement('div');
        nextSpan.className = nextScheduled.overdue ? 'next-scheduled overdue' : 'next-scheduled';
        nextSpan.textContent = 'Next: ' + nextScheduled.text;
        
        taskDate.appendChild(dateSpan);
        taskDate.appendChild(daysSpan);
        taskDate.appendChild(nextSpan);
    } else {
        const neverSpan = document.createElement('div');
        neverSpan.className = 'never-completed';
        neverSpan.textContent = 'Never completed';
        
        // Calculate next scheduled date even if never completed
        const nextScheduled = getNextScheduledDate(task);
        const nextSpan = document.createElement('div');
        nextSpan.className = 'next-scheduled';
        nextSpan.textContent = 'Next: ' + nextScheduled.text;
        
        taskDate.appendChild(neverSpan);
        taskDate.appendChild(nextSpan);
    }
    
    taskItem.appendChild(taskInfo);
    taskItem.appendChild(taskDate);
    
    return taskItem;
}

// Create a weekly task element (non-interactive)
function createWeeklyTaskElement(task) {
    const taskItem = document.createElement('div');
    taskItem.className = 'weekly-task-item';
    
    const taskName = document.createElement('div');
    taskName.className = 'weekly-task-name';
    taskName.textContent = task.name;
    
    const taskLocation = document.createElement('div');
    taskLocation.className = 'weekly-task-location';
    const minutes = task.minutes ? ` • ${task.minutes} min` : '';
    taskLocation.textContent = `📍 ${task.location}${minutes}`;
    
    taskItem.appendChild(taskName);
    taskItem.appendChild(taskLocation);
    
    return taskItem;
}

// Load task states from Firebase or localStorage
async function loadTaskStates() {
    const today = new Date().toDateString();
    
    if (db) {
        try {
            const doc = await db.collection('taskStates').doc(today).get();
            
            if (doc.exists) {
                const data = doc.data();
                // Apply saved states to checkboxes
                Object.keys(data.tasks).forEach(taskId => {
                    const checkbox = document.querySelector(`[data-task-id="${taskId}"]`);
                    if (checkbox) {
                        checkbox.checked = data.tasks[taskId];
                    }
                });
            }
        } catch (error) {
            console.error('Error loading task states from Firebase:', error);
            // Fallback to localStorage
            const savedData = localStorage.getItem(STORAGE_KEY);
            if (savedData) {
                try {
                    const data = JSON.parse(savedData);
                    if (data.date === today) {
                        Object.keys(data.tasks).forEach(taskId => {
                            const checkbox = document.querySelector(`[data-task-id="${taskId}"]`);
                            if (checkbox) {
                                checkbox.checked = data.tasks[taskId];
                            }
                        });
                    }
                } catch (error) {
                    console.error('Error loading task states from localStorage:', error);
                }
            }
        }
    } else {
        const savedData = localStorage.getItem(STORAGE_KEY);
        
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                
                // Check if saved data is from today
                if (data.date === today) {
                    // Apply saved states to checkboxes
                    Object.keys(data.tasks).forEach(taskId => {
                        const checkbox = document.querySelector(`[data-task-id="${taskId}"]`);
                        if (checkbox) {
                            checkbox.checked = data.tasks[taskId];
                        }
                    });
                } else {
                    // New day, clear old data
                    localStorage.removeItem(STORAGE_KEY);
                }
            } catch (error) {
                console.error('Error loading task states:', error);
            }
        }
    }
}

// Save task states to Firebase or localStorage
async function saveTaskStates() {
    const today = new Date().toDateString();
    const checkboxes = document.querySelectorAll('.task-checkbox');
    const taskStates = {};
    
    checkboxes.forEach(checkbox => {
        const taskId = checkbox.getAttribute('data-task-id');
        taskStates[taskId] = checkbox.checked;
    });
    
    const data = {
        date: today,
        tasks: taskStates
    };
    
    if (db) {
        try {
            await db.collection('taskStates').doc(today).set(data);
            // Don't show toast for every checkbox, only on errors
        } catch (error) {
            console.error('Error saving task states to Firebase:', error);
            showToast('Failed to sync. Using offline mode.', 'error');
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
    } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
    
    // Update history view when tasks are checked/unchecked
    renderHistoryView();
}

// Set up real-time listeners for Firebase sync
function setupRealtimeListeners() {
    if (!db) return;
    
    const today = new Date().toDateString();
    let isFirstSnapshot = true;
    
    // Listen for changes to today's task states
    db.collection('taskStates').doc(today).onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            let hasUpdates = false;
            
            // Update checkboxes without triggering save
            Object.keys(data.tasks).forEach(taskId => {
                const checkbox = document.querySelector(`[data-task-id="${taskId}"]`);
                if (checkbox && checkbox.checked !== data.tasks[taskId]) {
                    hasUpdates = true;
                    
                    // Remove event listener temporarily to avoid triggering save
                    const oldOnChange = checkbox.onchange;
                    checkbox.onchange = null;
                    checkbox.checked = data.tasks[taskId];
                    checkbox.onchange = oldOnChange;
                    
                    // Update completion styles
                    const taskItem = checkbox.closest('.task-item');
                    if (taskItem) {
                        if (checkbox.checked) {
                            taskItem.classList.add('completed');
                        } else {
                            taskItem.classList.remove('completed');
                        }
                    }
                }
            });
            
            // Show toast only if this is not the first snapshot and there were updates
            if (!isFirstSnapshot && hasUpdates) {
                showToast('Tasks synced from partner', 'success');
            }
            isFirstSnapshot = false;
        }
    }, (error) => {
        console.error('Error listening to task states:', error);
        showToast('Sync error. Working offline.', 'error');
    });
    
    // Listen for changes to task history
    db.collection('taskHistory').doc('shared').onSnapshot((doc) => {
        if (doc.exists) {
            renderHistoryView();
        }
    }, (error) => {
        console.error('Error listening to task history:', error);
    });
    
    console.log('✅ Real-time listeners set up');
}
