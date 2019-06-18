import * as vscode from 'vscode';

export class OrgLinkProvider implements vscode.DocumentLinkProvider {

   public provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentLink[]> {
      console.log("provideDocumentLinks: ", document.fileName);

      return new Promise<vscode.DocumentLink[]>(async function (resolve, reject) {

         // Prepare the list of possible link targets
         const files = await vscode.workspace.findFiles("*.org");

         // tslint:disable-next-line: max-classes-per-file
         class Linkable {
            public relativeName: string;
            public uri: vscode.Uri;
            public regex: RegExp;

            constructor(rel: string, uri: vscode.Uri) {
               this.relativeName = rel;
               this.uri = uri;
               this.regex = new RegExp(rel + "(?::(\\d+))?");
            }
         }

         const relFiles: Linkable[] = new Array();
         files.forEach(element => {
            relFiles.push(new Linkable(vscode.workspace.asRelativePath(element.path), element));
         });

         const result: vscode.DocumentLink[] = new Array();

         // Now scan the document for links. Each line is scanned for all possible links
         for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i).text;

            relFiles.forEach(element => {
               const matches = element.regex.exec(line);
               if (matches) {
                  const startpos = line.indexOf(matches[0]);
                  const endpos = startpos + matches[0].length;
                  const range = new vscode.Range(new vscode.Position(i, startpos), new vscode.Position(i, endpos));

                  if (matches.length < 2) {
                     // Add link to file without line number
                     result.push(new vscode.DocumentLink(range, element.uri));
                  }
                  else {
                     // Add link to file with line number
                     result.push(new vscode.DocumentLink(range, element.uri.with({ fragment: matches[1] })));
                  }
               }

            });
         }

         resolve(result);
      });
   }

};