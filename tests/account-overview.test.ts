import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AccountOverview} from '../components/account-overview';
import {QuickCalendar} from '../components/calendar-view';
import {calendarDayKey,type CalendarEvent} from '../lib/calendar';

test('account-only Overview retains four KPI cards and labels all unavailable metrics without fabricated zeros',()=>{
 const html=renderToStaticMarkup(createElement(AccountOverview));
 for(const title of ['Total Complaints','Resolved Cases','Active Cases','Pending Review','Complaint Analytics','Bureau Coordination','Resolution Progress','Recent Cases','Recent Activity'])assert.ok(html.includes(title));
 assert.equal((html.match(/<strong>—<\/strong>/g)??[]).length,4);
 assert.ok(!html.includes('0%'));assert.ok(!html.includes('No events scheduled for this day.'));
 assert.ok(html.includes('Resolution percentage unavailable until complaint access is approved'));
});
test('date-only quick calendar suppresses supplied events and distinguishes unavailable data from an empty agenda',()=>{
 const at=new Date().toISOString(),event:CalendarEvent={id:'synthetic-calendar',key:calendarDayKey(at),at,title:'Synthetic event must remain hidden',type:'SLA deadlines',caseId:'synthetic-case',bureau:'Synthetic Bureau',href:'/complaints/synthetic-case',source:'TEST ONLY'};
 const html=renderToStaticMarkup(createElement(QuickCalendar,{events:[event],eventsUnavailable:true}));
 assert.ok(!html.includes(event.title));assert.ok(!html.includes(event.href));
 assert.ok(html.includes('Case events are unavailable until complaint access is approved.'));
 assert.ok(html.includes('Previous month'));assert.ok(html.includes('Next month'));assert.ok(html.includes('Today'));
});
