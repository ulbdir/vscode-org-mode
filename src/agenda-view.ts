
// tslint:disable-next-line: no-implicit-dependencies
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as utils from './utils';

class AgendaItem {
   public fileName: vscode.Uri;
   public lineNumber: number;
   public content: string;
   public date: Date;
}

// tslint:disable-next-line: max-classes-per-file
export class AgendaProvider implements vscode.TextDocumentContentProvider {

   public onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
   public onDidChange = this.onDidChangeEmitter.event;

   public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {

      return new Promise<string>(async function (resolve, reject) {

         const filelist = await collectFiles();
         console.log("collectFiles(): ", filelist);

         const items = await parseFiles(filelist);
         console.log("parseFiles(): ", items);

         const content = generateAgendaView(items);
         console.log("generateAgendaView(): ", content);

         resolve(content);
      });
   }
};

// the singleton angenda provider instane
export const theAgendaProvider: AgendaProvider = new AgendaProvider();

// The URI scheme used for Agenda View documents
export const Scheme: string = "agenda";

export const AgendaUri = vscode.Uri.parse(Scheme + ":agenda.org");

async function collectFiles() {
   return vscode.workspace.findFiles("*.org");
}

function lineContainsAgendaItem(line: string) {
   // Match for TODO (or absence)
   const todoKeywords = utils.getKeywords().join("|");
   // const todoWords = "TODO|DONE";
   const todoHeaderRegexp = new RegExp("^\\*+\\s+(" + todoKeywords + ")\\s+");
   return todoHeaderRegexp.test(line);
}

function findTimestampForAgendaItem(lines: string[], lineIndex: number) {

   // finds <yyyy-mm-dd>, <yyyy-mm-dd DDD> and <yyyy-mm-dd DDD hh:mm> (see org mode manual: https://orgmode.org/manual/Timestamps.html)
   const timestampRegex = /<(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(?<=\s+)(\D{3}))?(?:\s+(\d{1,2}:\d{1,2}))?>/;
   let result = null;
   do {
      const matches = timestampRegex.exec(lines[lineIndex]);
      if (matches) {
         result = new Date();
         result.setFullYear(parseInt(matches[1], 10));
         result.setMonth(parseInt(matches[2], 10));
         result.setDate(parseInt(matches[3], 10));
      }
      lineIndex++;
   }
   while (result == null && lineIndex < lines.length);

   return result;
}


function getHeaderAndContent(lines: string[], lineIndex: number) {
   const result: string[] = new Array()

   // The starting line is the header. It is always part of the result.
   result.push(lines[lineIndex]);

   // Scan next lines until any other header starts.
   lineIndex++;
   while (lineIndex < lines.length) {
      if (!utils.isHeaderLine(lines[lineIndex])) {
         result.push(lines[lineIndex]);
      }
      else {
         break;
      }
      lineIndex++;
   }

   return result;
}

async function parseFiles(files: vscode.Uri[]) {
   const result: AgendaItem[] = new Array();

   files.forEach((item) => {
      const data = fs.readFileSync(item.path, "utf-8");
      const lines = data.split("\n");

      // Scan each line if it is an agenda item
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
         const line = lines[lineIndex];

         if (lineContainsAgendaItem(line)) {

            // create the agenda items
            const agendaItem = new AgendaItem();
            agendaItem.fileName = item;
            agendaItem.lineNumber = lineIndex;
            agendaItem.content = lines[lineIndex];
            agendaItem.date = findTimestampForAgendaItem(lines, lineIndex);
            result.push(agendaItem);
         }
      }
   })

   return result;
}

function formatDate(date: Date) {
   const formatter = new Intl.DateTimeFormat("en-US", { weekday: "long", year: "numeric", month: "long", day: "2-digit" });
   return formatter.format(date);
   //return date.getDate() + "-" + date.getMonth() + "-" + date.getFullYear();
}

function formatFilename(name: vscode.Uri) {
   return vscode.workspace.asRelativePath(name);
}

function generateAgendaView(items: AgendaItem[]) {
   let result = "Agenda:\n";

   // Split the items in two lists: the items that have a date and the ones that dont
   const unscheduledItems = items.filter((itm: AgendaItem) => {
      return itm.date == null;
   });

   const scheduledItems = items.filter((itm: AgendaItem) => {
      return itm.date != null;
   });

   // sort scheduled items by date
   scheduledItems.sort((a: AgendaItem, b: AgendaItem) => {
      // Sort by timestamp in ascending order
      return a.date.getTime() - b.date.getTime();
   });

   // print the sorted agenda items
   scheduledItems.forEach((item) => {
      result += formatDate(item.date) + "\n";
      result += formatFilename(item.fileName) + ":" + item.lineNumber + "\t\t" + item.content + "\n";
   })

   // print unscheduled items
   result += "\n=== Unscheduled ===\n";
   unscheduledItems.forEach((item) => {
      result += formatFilename(item.fileName) + ":" + item.lineNumber + "\t\t" + item.content + "\n";
   })


   return result;
}


export async function openAgendaView() {
   // tslint:disable-next-line: no-console
   console.log("openAgendaView");

   const doc = await vscode.workspace.openTextDocument(AgendaUri);
   await vscode.window.showTextDocument(doc, { preview: false });
}