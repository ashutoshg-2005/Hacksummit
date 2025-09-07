import JSONL from "jsonl-parse-stringify";
import { inngest } from "@/inngest/client";
import { StreamTranscriptItem } from "@/modules/meetings/types";
import { agents, meetings, user } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { createAgent, openai, TextMessage } from "@inngest/agent-kit";


const summarizer = createAgent({
  name: "summarizer",
  system: `You are an expert meeting summarizer specializing in business meetings, project discussions, and team collaborations. Your goal is to create comprehensive, actionable summaries that help participants follow up effectively.

  Use the following markdown structure for every meeting summary:

  ## Meeting Overview
  Provide a concise but comprehensive summary of the meeting's purpose, main topics discussed, and overall outcomes. Include the general tone and productivity level of the meeting.

  ## Key Decisions Made
  List all important decisions that were finalized during the meeting:
  - **Decision:** [What was decided]
  - **Context:** [Why this decision was made]
  - **Impact:** [How this affects the project/team]

  ## Action Items & Next Steps
  Clearly identify all actionable items discussed:
  - **Action:** [Specific task or deliverable]
  - **Owner:** [Who is responsible - extract from transcript]
  - **Timeline:** [Deadline or timeframe mentioned]
  - **Dependencies:** [What needs to happen first, if any]

  ## Important Discussion Points
  Capture significant topics, concerns, or insights shared:
  - **Topic:** [Subject discussed]
  - **Key Points:** [Main insights or concerns raised]
  - **Resolution:** [How it was addressed or if it needs follow-up]

  ## Participant Contributions
  Highlight notable contributions from different participants:
  - **[Participant Name]:** [Their key contributions or insights]

  ## Open Issues & Follow-ups
  List any unresolved matters that need attention:
  - **Issue:** [What remains unresolved]
  - **Next Steps:** [Suggested approach to resolution]
  - **Priority:** [High/Medium/Low based on discussion tone]

  ## Meeting Metrics
  - **Duration:** [Extract from timestamps]
  - **Participation Level:** [Active/Moderate/Low based on speaker distribution]
  - **Productivity Score:** [High/Medium/Low based on decisions made and clarity]

  ## Recommended Follow-ups
  Based on the discussion, suggest:
  - Follow-up meetings needed
  - Documents or research required
  - Stakeholders to involve
  - Timeline for next check-in

  **Instructions:**
  - Extract specific names, dates, and commitments from the transcript
  - If timeline/owner information is unclear, note it as "[To be clarified]"
  - Focus on actionable insights rather than just documenting what was said
  - Use professional but accessible language
  - Ensure every section adds value for post-meeting planning`.trim(),
  model: openai({model:"gpt-4o" , apiKey: process.env.OPENAI_API_KEY}),
})

export const meetingsProcessing = inngest.createFunction(
  {id : "meetings/processing"},
  { event: "meetings/processing" },
  async ({event, step}) =>{
    const response = await step.run("fetch-transcript", async () => {
      return fetch(event.data.transcriptUrl).then((res) => res.text());
    });

    const transcript = await step.run("parse transcript", async () => {
      return JSONL.parse<StreamTranscriptItem>(response);
    })

    const transcriptionWithSpeaker = await step.run("add-speakers", async () =>{
      const speakerIds = [
        ...new Set(transcript.map((item) => item.speaker_id)),
      ];

      const userSpeakers = await db
        .select()
        .from(user)
        .where(inArray(user.id, speakerIds))
        .then((users) => 
          users.map((user) => ({
            ...user,
          }))
        );

      const agentSpeakers = await db
        .select()
        .from(agents)
        .where(inArray(agents.id, speakerIds))
        .then((agents) => 
          agents.map((agent) => ({
            ...agent,
          }))
        );
        
      const speakers = [...userSpeakers, ...agentSpeakers];
      
      return transcript.map((item) => {
        const speaker = speakers.find(
          (speaker) => speaker.id === item.speaker_id
        );

        if (!speaker) {
          return{
            ...item,
            user:{
              name: "Unknown",
            }
          }
        };

        return {
          ...item,
          user :{
            name:speaker.name,
          }
        };

      });

    });

    const {output} = await summarizer.run(
      "Summarize the following transcript: " +
        JSON.stringify(transcriptionWithSpeaker),
    )

    await step.run("save-summary", async () => {
      await db
        .update(meetings)
        .set({
          summary: (output [0] as TextMessage).content as string
        })
        .where(eq(meetings.id, event.data.meetingId));
    })
  },
);