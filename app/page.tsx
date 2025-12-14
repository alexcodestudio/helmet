import Image from "next/image";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <main className="self-left">
        <h1>HelmetCheck API</h1>
        <p>
          Project for checking if persons are wearing a helmet in provided
          pictures
        </p>
      </main>
    </div>
  );
}
