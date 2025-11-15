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
    console.log('Pomodoro with website blocking activated!');

    let statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = "🍅 Ready";
    statusBar.show();

    let startCmd = vscode.commands.registerCommand('pomodoro.start', () => {
        startSession(25, 5);
    });

    let stopCmd = vscode.commands.registerCommand('pomodoro.stop', () => {
        stopSession();
    });

    function startSession(workMinutes: number, breakMinutes: number) {
        if (isRunning) {
            vscode.window.showWarningMessage('Timer already running!');
            return;
        }

        timeLeft = workMinutes * 60;
        isRunning = true;
        isBreak = false;
        
        vscode.window.showInformationMessage(`🍅 Pomodoro started! ${workMinutes} minutes focus time.`);

        // Start monitoring for distractions
        startMonitoring();

        // Start timer
        timer = setInterval(() => {
            timeLeft--;
            updateStatusBar();

            if (timeLeft <= 0) {
                if (!isBreak) {
                    // Work session done, start break
                    startBreak(breakMinutes);
                } else {
                    // Break session done
                    stopSession();
                    vscode.window.showInformationMessage('Break over! Ready to work again?');
                }
            }
        }, 1000);
    }

    function startBreak(breakMinutes: number) {
        clearInterval(timer!);
        timeLeft = breakMinutes * 60;
        isBreak = true;
        
        vscode.window.showInformationMessage(`☕ Break started! ${breakMinutes} minutes relax.`);

        timer = setInterval(() => {
            timeLeft--;
            updateStatusBar();

            if (timeLeft <= 0) {
                stopSession();
                vscode.window.showInformationMessage('Break over! Ready to work again?');
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
        statusBar.text = "🍅 Stopped";
        vscode.window.showInformationMessage('Timer stopped.');
    }

    function updateStatusBar() {
        let minutes = Math.floor(timeLeft / 60);
        let seconds = timeLeft % 60;
        let icon = isBreak ? '☕' : '🍅';
        statusBar.text = `${icon} ${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Color coding
        if (isBreak) {
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        }
    }

    async function startMonitoring() {
        if (monitor) {
            clearInterval(monitor);
        }

        monitor = setInterval(async () => {
            if (!isRunning || isBreak) return;

            try {
                let windowInfo = await getActiveWindow();
                if (isBlockedSite(windowInfo.title)) {
                    await showWarning(windowInfo.title);
                }
            } catch (error) {
                // Ignore errors
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

    function isBlockedSite(windowTitle: string): boolean {
        if (!windowTitle) return false;

        let config = vscode.workspace.getConfiguration('pomodoro');
        let blockedSites = config.get<string[]>('blockedSites', []);
        
        return blockedSites.some(site => 
            windowTitle.toLowerCase().includes(site.toLowerCase())
        );
    }

    async function showWarning(site: string) {
        let messages = [
            "Эй! Фокусируйся! 🍅",
            "Не отвлекайся на " + site + "!",
            "Вернись к работе! 💻",
            "Помни о Pomodoro! ⏰"
        ];

        let randomMsg = messages[Math.floor(Math.random() * messages.length)];
        
        let choice = await vscode.window.showWarningMessage(
            randomMsg,
            { modal: true },
            "OK, возвращаюсь",
            "Игнорировать"
        );

        if (choice === "OK, возвращаюсь") {
            vscode.window.showInformationMessage("Отлично! Продолжаем работать! 🎯");
        }
    }

    context.subscriptions.push(startCmd, stopCmd, statusBar);
}

export function deactivate() {
    if (timer) clearInterval(timer);
    if (monitor) clearInterval(monitor);
}