import { commands, TextDocument, window, workspace, WorkspaceFolder } from 'vscode';
import { CloseAction, ErrorAction, ExecuteCommandRequest, LanguageClient, LanguageClientOptions, RevealOutputChannelOn, ServerOptions, TransportKind, WorkspaceFoldersRequest } from 'vscode-languageclient';
import { setDiagnosticsBegin, setDiagnosticsEnd, setCleanBegin, setCleanEnd, diagnosticsBegin, diagnosticsEnd, cleanBegin, cleanEnd } from './notifications';
import { setMiddleware, middleware } from './middleware';
type ExtensionCommands = {[cmd: string]: (args: any[]) => void };

const clients: Map<string, LanguageClient> = new Map();
const commandCode: Map<string, ExtensionCommands> = new Map();

export function activate() {
    const activatePS = require('./bundle').main;

    const module = require.resolve('purescript-language-server');
    const opts = { module, transport: TransportKind.ipc };
    const serverOptions: ServerOptions =
        {
            run: opts,
            debug: { ...opts, options: {
                execArgv: [
                    "--nolazy",
                    "--inspect=6009"
                ]
            }}
        }
    const output = window.createOutputChannel("IDE PureScript");
    // Options to control the language client
    const clientOptions = (folder: WorkspaceFolder): LanguageClientOptions => ({
        // Register only for PureScript documents in the given root folder
        documentSelector: [
            { scheme: 'file', language: 'purescript', pattern: `${folder.uri.fsPath}/**/*` },
            ...folder.index === 0 ? [ { scheme: 'untitled', language: 'purescript' } ] : []
        ],
        workspaceFolder: folder,
        synchronize: {
            configurationSection: 'purescript',
            fileEvents: workspace.createFileSystemWatcher('**/*.purs')
        },
        outputChannel: output,
        revealOutputChannelOn: RevealOutputChannelOn.Never,
        errorHandler: { 
            error: (e,m,c) => { console.error(e,m,c); return ErrorAction.Continue  },
            closed: () => CloseAction.DoNotRestart
        },
        initializationOptions: {
            executeCommandProvider: false
        },
        middleware
    });

    let commandNames: string[] = [
        "caseSplit-explicit",
        "addClause-explicit",
        "addCompletionImport",
        "addModuleImport",
        "replaceSuggestion",
        "replaceAllSuggestions",
        "build",
        "clean",
        "typedHole-explicit",
        "startPscIde",
        "stopPscIde",
        "restartPscIde",
        "getAvailableModules",
        "search",
        "fixTypo",
        "sortImports"
    ].map(x => `purescript.${x}`);

    const getWorkspaceFolder = (doc: TextDocument) => {
        if (doc.uri.scheme === 'file') {
            const wf = workspace.getWorkspaceFolder(doc.uri);
            if (wf) {
                return wf;
            }
        }
        if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
            return workspace.workspaceFolders[0];
        }
        return null;
    }

    commandNames.forEach(command => {
        commands.registerTextEditorCommand(command, (ed, edit, ...args) => {
            const wf = getWorkspaceFolder(ed.document);
            if (!wf) { return; }
            const lc = clients.get(wf.uri.toString());
            if (!lc) {
                output.appendLine("Didn't find language client for " + ed.document.uri);
                return;
            }
            lc.sendRequest(ExecuteCommandRequest.type, { command, arguments: args });
        });
    })

    const extensionCmd = (cmdName: string) => (ed, edit, ...args) => {
        const wf = getWorkspaceFolder(ed.document);
        if (!wf) { return; }
        const cmds = commandCode.get(wf.uri.toString());
        if (!cmds) {
            output.appendLine("Didn't find language client for " + ed.document.uri);
            return;
        }
        cmds[cmdName](args);
    }

    function addClient(folder: WorkspaceFolder) {
        if (!clients.has(folder.uri.toString())) {
            try {
                output.appendLine("Launching new language client for " + folder.uri.toString());
                const client = new LanguageClient('purescript', 'IDE PureScript', serverOptions, clientOptions(folder));
                client.registerProposedFeatures();
            
                client.onReady().then(async () => {
                    output.appendLine("Activated lc for "+ folder.uri.toString());
                    const cmds: ExtensionCommands = activatePS({ diagnosticsBegin, diagnosticsEnd, cleanBegin, cleanEnd }, client);
                    const cmdNames = await commands.getCommands();
                    commandCode.set(folder.uri.toString(), cmds);
                    Promise.all(Object.keys(cmds).map(async cmd => {
                        if (cmdNames.indexOf(cmd) === -1) {
                            commands.registerTextEditorCommand(cmd, extensionCmd(cmd));
                        }
                    }));
                }).catch(err => output.appendLine(err));

                client.start();
                clients.set(folder.uri.toString(), client);
            } catch (e) {
                output.appendLine(e);
            }
        }
    }

    function didOpenTextDocument(document: TextDocument): void {
        if (document.languageId !== 'purescript' || document.uri.scheme !== 'file') {
            return;
        }

        const folder = workspace.getWorkspaceFolder(document.uri);
        if (!folder) {
            output.appendLine("Didn't find workspace folder for " + document.uri);
            return;
        }
        addClient(folder);
    }

    workspace.onDidOpenTextDocument(didOpenTextDocument);
    workspace.textDocuments.forEach(didOpenTextDocument);
    workspace.onDidChangeWorkspaceFolders((event) => {
        for (const folder of event.removed) {
            const client = clients.get(folder.uri.toString());
            if (client) {
                clients.delete(folder.uri.toString());
                client.stop();
            }
        }
    });
    if (clients.size == 0) {
        if (workspace.workspaceFolders && workspace.workspaceFolders.length == 1) {
            output.appendLine("Only one folder in workspace, starting language server");
            // The extension must be activated because there are Purs files in there
            addClient(workspace.workspaceFolders[0]);
        } else if (workspace.workspaceFolders && workspace.workspaceFolders.length > 1) {
            output.appendLine("More than one folder in workspace, open a PureScript file to start language server");
        } else if (!workspace.workspaceFolders) {
            output.appendLine("It looks like you've started VS Code without specifying a folder, ie from a language extension development environment. Open a PureScript file to start language server.");
        }
    }
    return { setMiddleware, setDiagnosticsBegin, setDiagnosticsEnd, setCleanBegin, setCleanEnd }
}
export function deactivate(): Thenable<void> {
	let promises: Thenable<void>[] = [];
	for (let client of Array.from(clients.values())) {
		promises.push(client.stop());
	}
	return Promise.all(promises).then(() => undefined);
}
