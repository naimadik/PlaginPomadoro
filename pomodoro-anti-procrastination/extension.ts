import * as vscode from 'vscode';

let timer: NodeJS.Timeout | undefined;
let timeLeft: number = 0;
let isRunning: boolean = false;

export function activate(context: vscode.ExtensionContext) {
    console.log('Pomodoro timer activated!');

    let statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = "🍅 Ready";
    statusBar.show();

    let startCmd = vscode.commands.registerCommand('pomodoro.start', () => {
        if (isRunning) {
            vscode.window.showWarningMessage('Timer already running!');
            return;
        }

        timeLeft = 25 * 60; // 25 minutes
        isRunning = true;
        
        vscode.window.showInformationMessage('🍅 Pomodoro started! 25 minutes focus time.');

        timer = setInterval(() => {
            timeLeft--;
            
            let minutes = Math.floor(timeLeft / 60);
            let seconds = timeLeft % 60;
            statusBar.text = `🍅 ${minutes}:${seconds.toString().padStart(2, '0')}`;

            if (timeLeft <= 0) {
                clearInterval(timer!);
                isRunning = false;
                statusBar.text = "🍅 Done!";
                vscode.window.showInformationMessage('🎉 Time\'s up! Take a 5 minute break.', 'Start Break')
                    .then(choice => {
                        if (choice === 'Start Break') {
                            startBreak();
                        }
                    });
            }
        }, 1000);
    });

    let stopCmd = vscode.commands.registerCommand('pomodoro.stop', () => {
        if (timer) {
            clearInterval(timer);
            timer = undefined;
        }
        isRunning = false;
        statusBar.text = "🍅 Stopped";
        vscode.window.showInformationMessage('Timer stopped.');
    });

    function startBreak() {
        timeLeft = 5 * 60; // 5 minutes
        isRunning = true;
        
        vscode.window.showInformationMessage('☕ Break started! 5 minutes relax.');

        timer = setInterval(() => {
            timeLeft--;
            
            let minutes = Math.floor(timeLeft / 60);
            let seconds = timeLeft % 60;
            statusBar.text = `☕ ${minutes}:${seconds.toString().padStart(2, '0')}`;

            if (timeLeft <= 0) {
                clearInterval(timer!);
                isRunning = false;
                statusBar.text = "🍅 Ready";
                vscode.window.showInformationMessage('Break over! Ready to work again?');
            }
        }, 1000);
    }

    context.subscriptions.push(startCmd, stopCmd, statusBar);
}

export function deactivate() {
    if (timer) {
        clearInterval(timer);
    }
}