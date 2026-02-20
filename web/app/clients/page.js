import ClientsClient from "./clients-client";

export const metadata = {
    title: "Clients & Extensions - TheContextCache",
    description: "Download the CLI, VS Code Extension, and Chrome extension for TheContextCache.",
};

export default function Page() {
    return <ClientsClient />;
}
