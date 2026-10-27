/** Public directory: destinations still enforce server-side officer authorization. */
export const siteNavigation=[
 {title:'Workspace',items:[['Overview','/dashboard'],['Intake Queue','/intake'],['Complaints','/complaints'],['Institutions','/institutions'],['My Work','/tasks'],['Calendar','/calendar']]},
 {title:'Intelligence & coordination',items:[['AI Intelligence','/intelligence'],['Cross-Bureau','/coordination'],['Dependency Explorer','/dependencies'],['Resolution Center','/resolutions'],['Relationship Graph','/graph'],['Case Workflow','/kanban']]},
 {title:'Insights & account',items:[['Analytics','/analytics'],['Reports','/reports'],['Notifications','/notifications'],['Bureau Directory','/team'],['My Account','/settings'],['User Approvals','/admin'],['Workspace Guide','/help']]},
] as const;
