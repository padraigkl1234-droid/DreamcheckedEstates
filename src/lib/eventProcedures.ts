// "Things to remember" reference content for Event Mode — the standing
// procedures everyone on shift should have to hand once a show is live on
// the Show Board. Static for this first pass; a later pass could let a
// commander edit these from the app instead of them living in code.

export interface EventProcedure {
  title: string;
  paragraphs: string[];
}

export const EVENT_PROCEDURES: EventProcedure[] = [
  {
    title: 'Show Stop Procedure',
    paragraphs: [
      'A briefing of these procedures will be held with the tour management, security, venue manager and safety manager before doors are opened.',
      'Show stops may be called for any medical, security or crowd safety incident where access to the main arena is required. Stops can be called by the Venue Manager, Security Manager, Safety Manager, Production Manager or the artist themselves.',
      'All public announcements will be made by the artist or a member of the stage management team.',
      'The show will not commence until the incident has been cleared and permission to restart has been given by the Venue Manager.',
      'The Venue Manager has the overriding authority on all show stop incidents and show restart.',
    ],
  },
  {
    title: 'Park Into Event Procedure 2026',
    paragraphs: [
      'The main aims are to:',
      '1. Make sure that those who have been here during the day do not feel that they are being pushed out.',
      '2. Process the queuing and ingress of those attending an evening safely and securely.',
      '3. Get the site ready for the evening event:',
      'a. Food Court — remove seating/parasols.',
      'b. F&B restock.',
      'c. Toilets — clean and open event toilets.',
      'd. Security personnel and ped barriers.',
      'e. Guest Experience.',
      '4. Ensure any sound checks are performed safely and secure…',
    ],
  },
];
