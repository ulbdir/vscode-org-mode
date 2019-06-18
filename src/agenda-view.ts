// tslint:disable-next-line: no-implicit-dependencies
import * as datefns from 'date-fns';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as utils from './utils';

class AgendaItem {
   public fileName: vscode.Uri;
   public lineNumber: number;
   public content: string;
   public date: Date;
   public scheduledDate: Date;
   public deadlineDate: Date;
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

   console.log("findTimestampForAgendaItem:", lines[lineIndex]);

   // finds <yyyy-mm-dd>, <yyyy-mm-dd DDD> and <yyyy-mm-dd DDD hh:mm> (see org mode manual: https://orgmode.org/manual/Timestamps.html)
   const timestampRegex = /(?<!(?:DEADLINE|SCHEDULED):\s{0,50})(?:<(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\D{3}))?(?:\s+(\d{1,2}:\d{1,2}))?)>/i;
   const deadlineRegex = /DEADLINE:\s*(?:<(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\D{3}))?(?:\s+(\d{1,2}:\d{1,2}))?)>/i;
   const scheduleRegex = /SCHEDULED:\s*(?:<(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\D{3}))?(?:\s+(\d{1,2}:\d{1,2}))?)>/i;

   let plainResult: Date = null;
   let scheduledResult: Date = null;
   let deadlineResult: Date = null;
   do {
      console.log("Testing line:", lines[lineIndex]);

      // Does this line contain a plain date?
      const plainDateMatches = timestampRegex.exec(lines[lineIndex]);
      if (plainDateMatches) {
         plainResult = new Date();
         plainResult.setFullYear(parseInt(plainDateMatches[1], 10));
         plainResult.setMonth(parseInt(plainDateMatches[2], 10) - 1);
         plainResult.setDate(parseInt(plainDateMatches[3], 10));
         console.log("plainResult set to ", plainResult);
      }

      // Does this line contain a scheduled date?
      const scheduledDateMatches = scheduleRegex.exec(lines[lineIndex]);
      if (scheduledDateMatches) {
         scheduledResult = new Date();
         scheduledResult.setFullYear(parseInt(scheduledDateMatches[1], 10));
         scheduledResult.setMonth(parseInt(scheduledDateMatches[2], 10) - 1);
         scheduledResult.setDate(parseInt(scheduledDateMatches[3], 10));
         console.log("scheduledResult set to ", scheduledResult);
      }

      // Does this line contain a deadline date?
      const deadlineDateMatches = deadlineRegex.exec(lines[lineIndex]);
      if (deadlineDateMatches) {
         deadlineResult = new Date();
         deadlineResult.setFullYear(parseInt(deadlineDateMatches[1], 10));
         deadlineResult.setMonth(parseInt(deadlineDateMatches[2], 10) - 1);
         deadlineResult.setDate(parseInt(deadlineDateMatches[3], 10));
         console.log("deadlineResult set to ", deadlineResult);
      }
      lineIndex++;
   }
   while (lineIndex < lines.length && !utils.isHeaderLine(lines[lineIndex]));

   return {
      plain: plainResult,
      scheduled: scheduledResult,
      deadline: deadlineResult
   };
}

async function parseFiles(files: vscode.Uri[]) {
   const result: AgendaItem[] = new Array();

   files.forEach((item) => {
      const data = fs.readFileSync(item.path, "utf-8");
      const lines = data.split("\n");

      console.log("parseFile(", item.toString(), ")");

      // Scan each line if it is an agenda item
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
         const line = lines[lineIndex];

         console.log("Processing line: ", line);

         if (lineContainsAgendaItem(line)) {

            // create the agenda items
            const agendaItem = new AgendaItem();
            agendaItem.fileName = item;

            // editor line numbers start with 1, so add one
            agendaItem.lineNumber = lineIndex + 1;
            agendaItem.content = lines[lineIndex];

            const dates = findTimestampForAgendaItem(lines, lineIndex);

            agendaItem.date = dates.plain;
            agendaItem.scheduledDate = dates.scheduled;
            agendaItem.deadlineDate = dates.deadline;

            result.push(agendaItem);
         }
      }
   })

   return result;
}

function formatDate(date: Date) {
   return datefns.format(date, "dddd Do MMMM");
}

function formatFilename(name: vscode.Uri) {
   return vscode.workspace.asRelativePath(name);
}


/**
 * Generates an agenda that lists all agenda items in chronological order.
 * Items are listed at the plain date, the scheduled date and at the deadline date.
 * Items without any date appear at the bottom in a separate list.
 */
function generateAgendaView(items: AgendaItem[]) {

   // tslint:disable-next-line: max-classes-per-file
   class ViewableItem {
      public LocationDescription: string;
      public Text: string;
      public When: Date;
      public Type: string;

      constructor(loc: string, content: string, when: Date, tp: string) {
         this.LocationDescription = loc;
         this.Text = content;
         this.When = when;
         this.Type = tp;
      }
   };

   let result = "Agenda:\n";

   // Split the items in two lists: the items that have a date and the ones that dont
   const unscheduledItems = items.filter((itm: AgendaItem) => {
      return itm.date == null && itm.deadlineDate == null && itm.scheduledDate == null;
   });

   const scheduledItems = items.filter((itm: AgendaItem) => {
      return itm.date != null || itm.scheduledDate != null || itm.deadlineDate != null;
   });

   // Generate the list of items to view, duplicating any items that need to be shown at multiple dates
   const itemsToView: ViewableItem[] = new Array();
   scheduledItems.forEach((item) => {
      if (item.date) {
         itemsToView.push(new ViewableItem(formatFilename(item.fileName) + ":" + item.lineNumber, item.content, item.date, "DATE"));
      }
      if (item.scheduledDate) {
         itemsToView.push(new ViewableItem(formatFilename(item.fileName) + ":" + item.lineNumber, item.content, item.scheduledDate, "SCHEDULED"));
      }
      if (item.deadlineDate) {
         itemsToView.push(new ViewableItem(formatFilename(item.fileName) + ":" + item.lineNumber, item.content, item.deadlineDate, "DEADLINE"));
      }
   });

   // sort scheduled items by date
   itemsToView.sort((a: ViewableItem, b: ViewableItem) => {
      // Sort by timestamp in ascending order
      return a.When.getTime() - b.When.getTime();
   });

   // print the sorted agenda items
   let lastDate: Date = null;
   let lastWeek: number = null;
   itemsToView.forEach((item) => {

      // Add a new week header
      if (!lastWeek || (lastWeek && (lastWeek !== datefns.getISOWeek(item.When)))) {
         lastWeek = datefns.getISOWeek(item.When);
         result += "\n* Week " + lastWeek + " " + datefns.getISOYear(item.When) + "\n";
      }

      // Add a new date line if the next item is on a different day, or if it is the first item to present
      if (!lastDate || (lastDate && (lastDate.toDateString() !== item.When.toDateString()))) {
         lastDate = item.When;

         result += "** " + formatDate(item.When) + "\n";
      }

      result += utils.padEnd(item.LocationDescription, 35, "  .") + " " + utils.padEnd(item.Type, 10) + " " + utils.stripHeaderPrefix(item.Text) + "\n";
   })

   // print unscheduled items
   result += "\n=== No dates set ===\n";
   unscheduledItems.forEach((item) => {
      result += formatFilename(item.fileName) + ":" + item.lineNumber + "\t\t" + utils.stripHeaderPrefix(item.content) + "\n";
   })

   return result;
}


export async function openAgendaView() {
   // tslint:disable-next-line: no-console
   console.log("openAgendaView");

   const doc = await vscode.workspace.openTextDocument(AgendaUri);
   await vscode.window.showTextDocument(doc, { preview: false });
}