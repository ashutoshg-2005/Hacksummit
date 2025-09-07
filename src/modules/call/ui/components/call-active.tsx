import { CallControls, SpeakerLayout } from "@stream-io/video-react-sdk";
import Image from "next/image";
import Link from "next/link";

interface Props{
    onLeave : () => void;   
    meetingName: string;
}

export const CallActive = ({ onLeave, meetingName }: Props) => {
    return (
        <div className="flex flex-col justify-between p-4 h-screen text-white">
            {/* Header */}
            <div className="bg-slate-900 rounded-full p-3 flex items-center gap-4 mb-2">
                <Link href="/" className="flex items-center justify-center p-1 bg-white/10 hover:bg-white/20 transition-colors rounded-full">
                    <Image src="/logo.svg" width={22} height={22} alt="logo" className="min-w-[22px]" />
                </Link>
                <h4 className="text-base truncate">{meetingName}</h4>
            </div>
            
            {/* Main content - video container */}
            <div className="flex-1 min-h-0 relative overflow-hidden rounded-xl mb-2">
                <SpeakerLayout />
            </div>
            
            {/* Footer controls */}
            <div className="bg-slate-900 rounded-full px-4 py-2">
                <CallControls onLeave={onLeave} />
            </div>
        </div>
    );
}