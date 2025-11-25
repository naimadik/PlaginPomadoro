import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let timer: NodeJS.Timeout | undefined;
let monitor: NodeJS.Timeout | undefined;
let timeLeft: number = 0;
let isRunning: boolean = false;
let isBreak: boolean = false;
let statusBar: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('🍅 Pomodoro Anti-Procrastination activated!');
    
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = "🍅 Ready";
    statusBar.tooltip = "Pomodoro Anti-Procrastination - Click to start";
    statusBar.command = 'pomodoro.quickStart';
    statusBar.show();

    const commands = [
        vscode.commands.registerCommand('pomodoro.quickStart', quickStart),
        vscode.commands.registerCommand('pomodoro.start', startPomodoro),
        vscode.commands.registerCommand('pomodoro.startCustom', startCustomPomodoro),
        vscode.commands.registerCommand('pomodoro.stop', stopPomodoro),
        vscode.commands.registerCommand('pomodoro.testMonitor', testMonitoring),
        vscode.commands.registerCommand('pomodoro.forceCloseTabs', forceCloseTabs)
    ];

    commands.forEach(cmd => context.subscriptions.push(cmd));
    context.subscriptions.push(statusBar);

    setTimeout(() => {
        vscode.window.showInformationMessage(
            '🍅 Pomodoro Anti-Procrastination готов! Нажми Cmd+Shift+8 для быстрого старта.',
            'Быстрый старт (25/5)',
            'Настроить время',
            'Тест мониторинга'
        ).then(choice => {
            if (choice === 'Быстрый старт (25/5)') {
                vscode.commands.executeCommand('pomodoro.start');
            } else if (choice === 'Настроить время') {
                vscode.commands.executeCommand('pomodoro.startCustom');
            } else if (choice === 'Тест мониторинга') {
                vscode.commands.executeCommand('pomodoro.testMonitor');
            }
        });
    }, 3000);
}

async function quickStart() {
    console.log('🍅 Quick Start command triggered');
    
    const config = vscode.workspace.getConfiguration('pomodoro');
    const workTime = config.get<number>('workTime', 25);
    const breakTime = config.get<number>('breakTime', 5);
    
    if (isRunning) {
        const status = isBreak ? 'Перерыв' : 'Работа';
        vscode.window.showInformationMessage(
            `🍅 Pomodoro уже запущен! ${status}: ${formatTime(timeLeft)} осталось`
        );
    } else {
        if (workTime <= 0 || breakTime <= 0) {
            vscode.window.showErrorMessage(
                'Некорректные настройки времени. Проверьте настройки Pomodoro.'
            );
            return;
        }
        startSession(workTime, breakTime);
    }
}

async function startPomodoro() {
    if (isRunning) {
        vscode.window.showWarningMessage('Сначала останови текущую сессию!');
        return;
    }

    const workTime = 25;
    const breakTime = 5;

    startSession(workTime, breakTime);
}

async function startCustomPomodoro() {
    if (isRunning) {
        vscode.window.showWarningMessage('Сначала останови текущую сессию!');
        return;
    }

    try {
        const workTime = await vscode.window.showQuickPick([
            { label: '15 минут', time: 15 },
            { label: '25 минут', time: 25 },
            { label: '30 минут', time: 30 },
            { label: '45 минут', time: 45 },
            { label: 'Свое время...', time: 0 }
        ], { placeHolder: 'Выбери время работы' });

        if (!workTime) { return; }

        let workMinutes = workTime.time;
        if (workMinutes === 0) {
            const custom = await vscode.window.showInputBox({
                placeHolder: 'Минуты работы (например, 29)',
                validateInput: (val) => {
                    const num = parseInt(val);
                    return (num > 0 && num <= 180) ? null : 'Введи число от 1 до 180';
                }
            });
            if (!custom) { return; }
            workMinutes = parseInt(custom);
        }
        const breakTime = await vscode.window.showQuickPick([
            { label: '5 минут', time: 5 },
            { label: '10 минут', time: 10 },
            { label: '15 минут', time: 15 },
            { label: 'Свое время...', time: 0 }
        ], { placeHolder: 'Выбери время перерыва' });

        if (!breakTime) { return; }

        let breakMinutes = breakTime.time;
        if (breakMinutes === 0) {
            const custom = await vscode.window.showInputBox({
                placeHolder: 'Минуты перерыва (например, 11)',
                validateInput: (val) => {
                    const num = parseInt(val);
                    return (num > 0 && num <= 60) ? null : 'Введи число от 1 до 60';
                }
            });
            if (!custom) { return; }
            breakMinutes = parseInt(custom);
        }

        if (isNaN(workMinutes) || workMinutes <= 0 || workMinutes > 180) {
            vscode.window.showErrorMessage('Некорректное время работы. Должно быть от 1 до 180 минут.');
            return;
        }
        
        if (isNaN(breakMinutes) || breakMinutes <= 0 || breakMinutes > 60) {
            vscode.window.showErrorMessage('Некорректное время перерыва. Должно быть от 1 до 60 минут.');
            return;
        }

        const config = vscode.workspace.getConfiguration('pomodoro');
        await config.update('workTime', workMinutes, vscode.ConfigurationTarget.Global);
        await config.update('breakTime', breakMinutes, vscode.ConfigurationTarget.Global);

        vscode.window.showInformationMessage(
            `✅ Настройки сохранены: ${workMinutes} мин работы, ${breakMinutes} мин перерыва`
        );

        startSession(workMinutes, breakMinutes);
    } catch (error) {
        vscode.window.showErrorMessage(`Ошибка: ${error}`);
    }
}

function stopPomodoro() {
    stopSession();
}

async function testMonitoring() {
    const windowInfo = await getActiveWindowInfo();
    if (windowInfo) {
        const isDistracting = isDistractingWindow(windowInfo);
        vscode.window.showInformationMessage(
            `Тест мониторинга:\nПриложение: ${windowInfo.app}\nЗаголовок: ${windowInfo.title}\nОтвлекает: ${isDistracting ? 'ДА' : 'НЕТ'}`
        );
        console.log('🍅 Test Monitor:', { windowInfo, isDistracting });
    } else {
        vscode.window.showWarningMessage('Не удалось получить информацию об активном окне');
    }
}

async function forceCloseTabs() {
    const config = vscode.workspace.getConfiguration('pomodoro');
    const blockedSites = config.get<string[]>('blockedSites', []);
    
    try {
        const result = await closeBrowserTabs(blockedSites);
        if (result.closedCount > 0) {
            vscode.window.showInformationMessage(`✅ Закрыто отвлекающих вкладок: ${result.closedCount}`);
        } else {
            vscode.window.showInformationMessage('🔍 Отвлекающие вкладки не найдены');
        }
    } catch (error) {
        vscode.window.showWarningMessage(`⚠️ Не удалось закрыть вкладки. Возможно, нужно дать разрешения в настройках безопасности macOS.`);
        console.log('🍅 Error closing tabs:', error);
    }
}

function startSession(workMinutes: number, breakMinutes: number) {
    if (isRunning) { 
        vscode.window.showWarningMessage('Pomodoro уже запущен! Остановите текущую сессию перед запуском новой.');
        return; 
    }

    if (workMinutes <= 0 || breakMinutes <= 0) {
        vscode.window.showErrorMessage('Некорректное время работы или перерыва.');
        return;
    }

    if (timer) {
        clearInterval(timer);
        timer = undefined;
    }
    if (monitor) {
        clearInterval(monitor);
        monitor = undefined;
    }

    timeLeft = workMinutes * 60;
    isRunning = true;
    isBreak = false;
    
    vscode.window.showInformationMessage(
        `🍅 Pomodoro запущен! ${workMinutes} минут фокусировки.`
    );

    startMonitoring();
    startTimer(workMinutes, breakMinutes);
    updateStatusBar();

    vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
}

function startTimer(workMinutes: number, breakMinutes: number) {
    if (timer) {
        clearInterval(timer);
        timer = undefined;
    }

    timer = setInterval(() => {
        if (!isRunning) {
            return;
        }
        
        timeLeft--;
        
        if (timeLeft < 0) {
            timeLeft = 0;
        }
        
        updateStatusBar();

        if (timeLeft <= 0) {
            if (!isBreak) {
               
                startBreak(breakMinutes);
            } else {
              
                stopSession();
                vscode.window.showInformationMessage(
                    '🎉 Перерыв окончен! Готов к следующей сессии?', 
                    'Начать новую сессию'
                ).then(choice => {
                    if (choice === 'Начать новую сессию') {
                        startSession(workMinutes, breakMinutes);
                    }
                });
            }
        }
    }, 1000);
}

function startBreak(breakMinutes: number) {
    if (timer) {
        clearInterval(timer);
        timer = undefined;
    }
    
    timeLeft = breakMinutes * 60;
    isBreak = true;
    
    vscode.window.showInformationMessage(
        `🎉 Рабочая сессия завершена! Начинается ${breakMinutes}-минутный перерыв.`
    );

    if (monitor) {
        clearInterval(monitor);
        monitor = undefined;
    }

    timer = setInterval(() => {
        if (!isRunning) {
            return;
        }
        
        timeLeft--;
        
        if (timeLeft < 0) {
            timeLeft = 0;
        }
        
        updateStatusBar();
        
        if (timeLeft <= 0) {
            clearInterval(timer);
            timer = undefined;
        }
    }, 1000);
}

function stopSession() {
    if (timer) {
        clearInterval(timer);
        timer = undefined;
    }
    if (monitor) {
        clearInterval(monitor);
        monitor = undefined;
    }
    
    isRunning = false;
    isBreak = false;
    timeLeft = 0;
    statusBar.text = "🍅 Ready";
    statusBar.backgroundColor = undefined;
    statusBar.tooltip = "Pomodoro Anti-Procrastination - Click to start";
    statusBar.command = 'pomodoro.quickStart';
    
    vscode.window.showInformationMessage('🍅 Pomodoro сессия остановлена.');
}

function updateStatusBar() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const icon = isBreak ? '☕' : '🍅';
    const label = isBreak ? 'Перерыв' : 'Фокус';
    statusBar.text = `${icon} ${label} ${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    if (isBreak) {
        statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        statusBar.tooltip = `Перерыв - ${formatTime(timeLeft)} осталось`;
    } else {
        statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        statusBar.tooltip = `Фокус время - ${formatTime(timeLeft)} осталось`;
    }
}

function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

async function startMonitoring() {
    console.log('🍅 Запускаю мониторинг окон...');
    
    if (monitor) {
        clearInterval(monitor);
    }

    monitor = setInterval(async () => {
        if (!isRunning || isBreak) { return; }

        try {
            const windowInfo = await getActiveWindowInfo();
            if (windowInfo && isDistractingWindow(windowInfo)) {
                console.log('🍅 Обнаружено отвлечение:', windowInfo);
                await handleDistraction(windowInfo);
            }
        } catch (error) {
            console.log('🍅 Ошибка мониторинга:', error);
        }
    }, 3000);
}

async function getActiveWindowInfo(): Promise<{title: string; app: string} | null> {
    try {
        const { stdout } = await execAsync(`
            osascript -e '
                tell application "System Events"
                    set frontApp to first application process whose frontmost is true
                    set appName to name of frontApp
                    try
                        set windowName to name of first window of frontApp
                    on error
                        set windowName to ""
                    end try
                    return appName & "|||" & windowName
                end tell
            '
        `);

        const [app, title] = stdout.trim().split('|||');
        return { 
            title: title || '', 
            app: app || ''
        };
    } catch (error) {
        console.log('🍅 Ошибка получения информации об окне:', error);
        return null;
    }
}

function isDistractingWindow(windowInfo: {title: string; app: string} | null): boolean {
    if (!windowInfo || !windowInfo.title) {
        return false;
    }

    const config = vscode.workspace.getConfiguration('pomodoro');
    const blockedSites = config.get<string[]>('blockedSites', []);
    
    const title = windowInfo.title.toLowerCase();
    const app = windowInfo.app.toLowerCase();

    const browsers = ['chrome', 'safari', 'firefox', 'edge', 'opera', 'brave'];
    const isBrowser = browsers.some(browser => app.includes(browser));

    if (!isBrowser) {
        return false;
    }

    const isDistracting = blockedSites.some(site => 
        title.includes(site.toLowerCase())
    );

    console.log('🍅 Проверка отвлечения:', {
        app: windowInfo.app,
        title: windowInfo.title,
        isBrowser: isBrowser,
        isDistracting: isDistracting
    });

    return isDistracting;
}

async function handleDistraction(windowInfo: {title: string; app: string}): Promise<void> {
    const shortTitle = windowInfo.title.length > 30 ? 
        windowInfo.title.substring(0, 30) + '...' : windowInfo.title;

    const config = vscode.workspace.getConfiguration('pomodoro');
    const autoClose = config.get<boolean>('autoCloseTabs', false);
    await showSystemAlert("Помидор следит!", `${windowInfo.app}: ${shortTitle}`);
    vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');

    if (autoClose) {
        try {
            const blockedSites = config.get<string[]>('blockedSites', []);
            
            if (blockedSites.length === 0) {
                vscode.window.showWarningMessage(
                    '⚠️ Список заблокированных сайтов пуст. Добавьте сайты в настройках.',
                    "Открыть настройки"
                ).then(choice => {
                    if (choice === 'Открыть настройки') {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'pomodoro.blockedSites');
                    }
                });
                return;
            }
            
            const result = await closeBrowserTabs(blockedSites);
            
            if (result.closedCount > 0) {
                vscode.window.showWarningMessage(
                    `🚫 Закрыто ${result.closedCount} отвлекающих вкладок! Фокусируйся на работе!`,
                    "Настройки"
                ).then(choice => {
                    if (choice === 'Настройки') {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'pomodoro');
                    }
                });
            } else {
                showDistractionDialog(shortTitle, windowInfo.app);
            }
        } catch (error) {
            console.log('🍅 Ошибка автоматического закрытия вкладок:', error);
            showDistractionDialog(shortTitle, windowInfo.app);
        }
    } else {
        showDistractionDialog(shortTitle, windowInfo.app);
    }
}

async function showDistractionDialog(shortTitle: string, app: string): Promise<void> {
    const messages = [
        "Эй! Ты же в Pomodoro! 🍅",
        "Не отвлекайся! Вернись к коду! 💻", 
        `${shortTitle} подождет! Закрой вкладку! 🚫`
    ];

    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    
    const choice = await vscode.window.showWarningMessage(
        randomMessage,
        { 
            modal: false, 
            detail: `Обнаружено отвлечение: ${app} - ${shortTitle}` 
        },
        "Закрыть вкладки автоматически",
        "Я вернулся!",
        "Игнорировать"
    );

    if (choice === "Закрыть вкладки автоматически") {
        await forceCloseTabs();
    } else if (choice === "Я вернулся!") {
        vscode.window.showInformationMessage("Молодец! Продолжаем в том же духе! 🎯");
    }
}

async function showSystemAlert(title: string, message: string): Promise<void> {
    const escapedTitle = title.replace(/"/g, '\\"');
    const escapedMessage = message.replace(/"/g, '\\"');

    const script = `
        display dialog "${escapedMessage}" with title "${escapedTitle}" buttons {"Ок"} default button "Ок" giving up after 8 with icon caution
    `;

    try {
        await execAsync(`osascript -e '${script}'`);
    } catch (error) {
        console.log('🍅 Ошибка показа системного предупреждения:', error);
    }
}
async function closeBrowserTabs(blockedSites: string[]): Promise<{closedCount: number}> {
    let closedCount = 0;
    
    try {
        closedCount += await closeChromeTabs(blockedSites);
        
        closedCount += await closeSafariTabs(blockedSites);
        
        return { closedCount };
    } catch (error) {
        console.log('🍅 Ошибка закрытия вкладок:', error);
        throw error;
    }
}

async function closeChromeTabs(blockedSites: string[]): Promise<number> {
    let closedCount = 0;
    
    if (blockedSites.length === 0) {
        return 0;
    }
    
    try {
        const sitesList = blockedSites.map(site => `"${site}"`).join(', ');
        const script = `
            tell application "Google Chrome"
                set closedCount to 0
                set blockedSites to {${sitesList}}
                repeat with w in every window
                    repeat with t in every tab of w
                        try
                            set tabURL to URL of t
                            set tabTitle to title of t
                            set shouldClose to false
                            repeat with blockedSite in blockedSites
                                if tabURL contains blockedSite or tabTitle contains blockedSite then
                                    set shouldClose to true
                                    exit repeat
                                end if
                            end repeat
                            if shouldClose then
                                close t
                                set closedCount to closedCount + 1
                            end if
                        end try
                    end repeat
                end repeat
                return closedCount
            end tell
        `;
        
        const { stdout } = await execAsync(`osascript -e '${script}'`);
        return parseInt(stdout.trim()) || 0;
    } catch (error) {
        console.log('🍅 Ошибка закрытия вкладок Chrome:', error);
        return 0;
    }
}

async function closeSafariTabs(blockedSites: string[]): Promise<number> {
    let closedCount = 0;
    
    if (blockedSites.length === 0) {
        return 0;
    }
    
    try {
        const sitesList = blockedSites.map(site => `"${site}"`).join(', ');
        const script = `
            tell application "Safari"
                set closedCount to 0
                set blockedSites to {${sitesList}}
                repeat with w in every window
                    repeat with t in every tab of w
                        try
                            set tabURL to URL of t
                            set tabName to name of t
                            set shouldClose to false
                            repeat with blockedSite in blockedSites
                                if tabURL contains blockedSite or tabName contains blockedSite then
                                    set shouldClose to true
                                    exit repeat
                                end if
                            end repeat
                            if shouldClose then
                                close t
                                set closedCount to closedCount + 1
                            end if
                        end try
                    end repeat
                end repeat
                return closedCount
            end tell
        `;
        
        const { stdout } = await execAsync(`osascript -e '${script}'`);
        return parseInt(stdout.trim()) || 0;
    } catch (error) {
        console.log('🍅 Ошибка закрытия вкладок Safari:', error);
        return 0;
    }
}

export function deactivate() {
    if (timer) { clearInterval(timer); }
    if (monitor) { clearInterval(monitor); }
}