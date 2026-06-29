// Single source of truth for the Mobaro / Microsoft Forms checklists, grouped
// into sections. Imported by both the Checklists directory page and the Shows
// readiness board, so adding a checklist here updates both.

export interface ChecklistForm {
  name: string;
  description?: string;
  url: string;
}
export interface ChecklistSection {
  name: string;
  forms: ChecklistForm[];
}

export const CHECKLIST_SECTIONS: ChecklistSection[] = [
  {
    name: 'Scenic Stage Show',
    forms: [
      {
        name: 'Event Manager Checklist',
        description: 'Overall event readiness and sign-off for the duty event manager.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUQzM1SVVONkROVFEzM0VYU1VYMDZJMjlBUi4u',
      },
      {
        name: 'Guest Experience Checklist',
        description: 'Guest-facing readiness — front of house, signage and customer areas.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUM0RMMUhPNTdKT0I4Mk1BSFpDOEhKSUtHWC4u',
      },
      {
        name: 'Fire Safety Officer Pre Checklist',
        description: 'Pre-event fire safety checks for the fire safety officer.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUN0dERlE0UDQ0TkkzMTFHWkpSTlJPWDVMUy4u',
      },
      {
        name: 'Operations Control Checklist',
        description: 'Operations control room readiness and comms checks.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUMjM1T0gzMTlOS1ozVjRTU0JXU0o3NzZXWC4u',
      },
      {
        name: 'Production Checklist',
        description: 'Stage, sound, lighting and production readiness checks.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUQkxEVFU1MVFQVFdSNEFIRTVOMEYxS1c1Ri4u',
      },
      {
        name: 'Security Pre-Door Checklist',
        description: 'Security checks completed before doors open.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtURFRPUUpBMUc1T0wzQ0pDOTBROFhLN1dIMS4u',
      },
    ],
  },
  {
    name: 'Park',
    forms: [
      {
        name: 'Operations Control Opening Checklist',
        description: 'Opening checks for the operations control room.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtURUlKU1k2NDNYSUs0WTZFRUdDMDVVTlk3Si4u',
      },
      {
        name: 'Operations Control Closing Checklist',
        description: 'Closing checks for the operations control room.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUNzAwT1VXNjFMM1VTSDdSV1FNMlpLVUNTQS4u',
      },
      {
        name: 'Park Manager Opening Checklist',
        description: "Park manager's opening readiness checks.",
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUNkVGSUxQSzVFSlhSTzhaWDhKTkFFUkoxTi4u',
      },
      {
        name: 'Security Opening Checklist',
        description: 'Security opening checks before the park opens.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUQzdBQTRFRFdWQUVGTFJNWktRNFEwQTRaVC4u',
      },
      {
        name: 'Security Closing Checklist',
        description: 'Security closing checks after the park closes.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUOUJXV0sxQ0dQTUo0QklFQUoyR1JDSU5EOS4u',
      },
      {
        name: 'Guest Experience Opening Checklist',
        description: 'Guest experience opening readiness checks.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUNjhMSldZOTlBTDZOTTVESFpYTjJYOUdXRC4u',
      },
      {
        name: 'Guest Experience Closing Checklist',
        description: 'Guest experience closing checks.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUMlpLRkhBT0dSMzc3RkxFV1hGMDQyNTdXMi4u',
      },
      {
        name: 'Guest Experience Roller Checklist',
        description: 'Guest experience checks for the Roller area.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUOU1SOEFWRUlNS0hROUJSNDJDU0pYR1BPVS4u',
      },
    ],
  },
  {
    name: 'Undercover Show',
    forms: [
      {
        name: 'Events Manager Checklist',
        description: 'Overall event readiness and sign-off for the events manager.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtURU1HMERFTzdFNUdUTFk1RU9OSkZVQ00zTy4u',
      },
      {
        name: 'Guest Experience Checklist',
        description: 'Guest-facing readiness — front of house, signage and customer areas.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUMkYwWlI1WllLSEJGTjk0Q05VWVdGTUJVQS4u',
      },
      {
        name: 'Operations Control Checklist',
        description: 'Operations control room readiness and comms checks.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUNEFWT0FHVkdaUUNSOVNQSTIyUU9XM0dMTS4u',
      },
      {
        name: 'Production Checklist',
        description: 'Stage, sound, lighting and production readiness checks.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUMzdBMFJSUE9STllGSE9EMkJaUDYzWFFQSi4u',
      },
      {
        name: 'Security Pre-Door Checklist',
        description: 'Security checks completed before doors open.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUODZRU0M0WlNQNTlMOTNSV0FBQlpGWEpJVS4u',
      },
    ],
  },
  {
    name: 'Estates',
    forms: [
      {
        name: 'Fire Door Checklist',
        description: 'Inspection of fire doors across the estate.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUN0ZQUFEwVjFIRkRXQTlNWlE0VUM4MTRONC4u',
      },
      {
        name: 'Water Fountain Checklist',
        description: 'Checks for the water fountains and drinking points.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUNzdUM0lBWUZYTFZHRFoyUU82NkI0TUlaNS4u',
      },
      {
        name: 'Drain & Gutter Inspection Checklist',
        description: 'Inspection of drains and gutters for blockages and damage.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtURDQ5MVIzUUxGMlhFN0tPOTM1QzVUQk9ZMC4u',
      },
      {
        name: 'Post-Show Estates Checklist',
        description: 'Estates make-safe and walk-round after a show.',
        url: 'https://forms.office.com/Pages/ResponsePage.aspx?id=mfoYGzQzY0iReafbLftttfmhIWgCpdxOr6oOIUXc-xtUNFBaVk5SR0EwVlVSSlEzNE5ZNVFZQjBOOC4u',
      },
    ],
  },
];
