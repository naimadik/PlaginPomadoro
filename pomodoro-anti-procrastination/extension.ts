import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let timer: NodeJS.Timeout | undefined;
let monitor: NodeJS.Timeout | undefined;
let timeLeft: number = 0;
let isRunning: boolean = false;
let isBreak: boolean = false;

export function activate(context: vscode.ExtensionContext) {
    console.log('🍅 Pomodoro Anti-Procrastination activated!');

    let statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = "🍅 Ready";
    statusBar.show();

    let startCmd = vscode.commands.registerCommand('pomodoro.start', () => {
        let config = vscode.workspace.getConfiguration('pomodoro');
        let workTime = config.get<number>('workTime', 25);
        let breakTime = config.get<number>('breakTime', 5);
        startSession(workTime, breakTime);
    });

    let startCustomCmd = vscode.commands.registerCommand('pomodoro.startCustom', async () => {
        if (isRunning) {
            vscode.window.showWarningMessage('Stop current session first!');
            return;
        }

        // Choose work time
        let workTime = await vscode.window.showQuickPick([
            { label: '15 minutes', time: 15 },
            { label: '25 minutes', time: 25 },
            { label: '30 minutes', time: 30 },
            { label: '45 minutes', time: 45 },
            { label: 'Custom...', time: 0 }
        ], { placeHolder: 'Select work time' });

        if (!workTime) return;

        let workMinutes = workTime.time;
        if (workMinutes === 0) {
            let custom = await vscode.window.showInputBox({
                placeHolder: 'Work minutes (e.g., 29)',
                validateInput: (val) => {
                    let num = parseInt(val);
                    return (num > 0 && num <= 120) ? null : 'Enter 1-120 minutes';
                }
            });
            if (!custom) return;
            workMinutes = parseInt(custom);
        }

        // Choose break time  
        let breakTime = await vscode.window.showQuickPick([
            { label: '5 minutes', time: 5 },
            { label: '10 minutes', time: 10 },
            { label: '15 minutes', time: 15 },
            { label: 'Custom...', time: 0 }
        ], { placeHolder: 'Select break time' });

        if (!breakTime) return;

        let breakMinutes = breakTime.time;
        if (breakMinutes === 0) {
            let custom = await vscode.window.showInputBox({
                placeHolder: 'Break minutes (e.g., 11)',
                validateInput: (val) => {
                    let num = parseInt(val);
                    return (num > 0 && num <= 60) ? null : 'Enter 1-60 minutes';
                }
            });
            if (!custom) return;
            breakMinutes = parseInt(custom);
        }

        // Save settings
        let config = vscode.workspace.getConfiguration('pomodoro');
        await config.update('workTime', workMinutes, true);
        await config.update('breakTime', breakMinutes, true);

        startSession(workMinutes, breakMinutes);
    });

    let stopCmd = vscode.commands.registerCommand('pomodoro.stop', () => {
        stopSession();
    });

    function startSession(workMinutes: number, breakMinutes: number) {
        if (isRunning) return;

        timeLeft = workMinutes * 60;
        isRunning = true;
        isBreak = false;
        
        vscode.window.showInformationMessage(
            `🍅 Pomodoro started! ${workMinutes} minutes focus time.`
        );

        startMonitoring();
        startTimer(workMinutes, breakMinutes);
        updateStatusBar();
    }

    function startTimer(workMinutes: number, breakMinutes: number) {
        timer = setInterval(() => {
            timeLeft--;
            updateStatusBar();

            if (timeLeft <= 0) {
                if (!isBreak) {
                    // Work → Break
                    startBreak(breakMinutes);
                } else {
                    // Break → Stop
                    stopSession();
                    vscode.window.showInformationMessage(
                        'Break over! Ready for next session?', 
                        'Start New Session'
                    ).then(choice => {
                        if (choice === 'Start New Session') {
                            startSession(workMinutes, breakMinutes);
                        }
                    });
                }
            }
        }, 1000);
    }

    function startBreak(breakMinutes: number) {
        clearInterval(timer!);
        timeLeft = breakMinutes * 60;
        isBreak = true;
        
        vscode.window.showInformationMessage(
            `🎉 Work session complete! ${breakMinutes} minute break started.`
        );

        timer = setInterval(() => {
            timeLeft--;
            updateStatusBar();
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
        statusBar.text = "🍅 Stopped";
        statusBar.backgroundColor = undefined;
    }

    function updateStatusBar() {
        let minutes = Math.floor(timeLeft / 60);
        let seconds = timeLeft % 60;
        let icon = isBreak ? '☕' : '🍅';
        let label = isBreak ? 'Break' : 'Focus';
        statusBar.text = `${icon} ${label} ${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        if (isBreak) {
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        }
    }

    async function startMonitoring() {
        monitor = setInterval(async () => {
            if (!isRunning || isBreak) return;

            try {
                let window = await getActiveWindow();
                if (isBlockedSite(window.title)) {
                    await handleDistraction(window.title);
                }
            } catch (error) {
                // Ignore monitoring errors
            }
        }, 3000);
    }

    async function getActiveWindow(): Promise<{title: string}> {
        try {
            let { stdout } = await execAsync(
                `osascript -e 'tell application "System Events" to get the name of every window of (every process whose frontmost is true)'`
            );
            return { title: stdout.trim() };
        } catch {
            return { title: '' };
        }
    }

    function isBlockedSite(title: string): boolean {
        if (!title) return false;

        let config = vscode.workspace.getConfiguration('pomodoro');
        let blocked = config.get<string[]>('blockedSites', []);
        
        return blocked.some(site => title.toLowerCase().includes(site.toLowerCase()));
    }

    async function handleDistraction(site: string) {
        let shortSite = site.length > 40 ? site.substring(0, 40) + '...' : site;
        let messages = [
            "Фокусируйся! Ты в Pomodoro! 🍅",
            "Вернись к работе! " + shortSite + " подождет!",
            "Не отвлекайся! Дедлайн не ждет! ⏰",
            "Код ждет! Закрой " + shortSite + "! 💻"
        ];

        let choice = await vscode.window.showWarningMessage(
            messages[Math.floor(Math.random() * messages.length)],
            { modal: true },
            "OK, закрываю",
            "Еще 5 минут..."
        );

        if (choice === "OK, закрываю") {
            vscode.window.showInformationMessage("Супер! Возвращаемся к работе! 🚀");
        }
    }

    // Show welcome message
    vscode.window.showInformationMessage(
        '🍅 Pomodoro Anti-Procrastination ready! Press Ctrl+Cmd+P to start.',
        'Quick Start (25/5)',
        'Custom Time'
    ).then(choice => {
        if (choice === 'Quick Start (25/5)') {
            vscode.commands.executeCommand('pomodoro.start');
        } else if (choice === 'Custom Time') {
            vscode.commands.executeCommand('pomodoro.startCustom');
        }
    });

    context.subscriptions.push(startCmd, startCustomCmd, stopCmd, statusBar);
}

export function deactivate() {
    if (timer) clearInterval(timer);
    if (monitor) clearInterval(monitor);
}