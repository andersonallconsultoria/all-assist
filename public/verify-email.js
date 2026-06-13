document.getElementById("verifyEmailButton").addEventListener("click", verifyEmail);

async function verifyEmail() {
  const message = document.getElementById("verifyEmailMessage");
  const button = document.getElementById("verifyEmailButton");
  const token = new URLSearchParams(window.location.search).get("token") || "";

  message.textContent = "Validando email...";
  button.disabled = true;

  try {
    const response = await fetch("/api/auth/email/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ token })
    });
    const payload = await response.json();

    if (!response.ok) {
      message.textContent = payload.error || "Nao foi possivel validar o email.";
      button.disabled = false;
      return;
    }

    message.textContent = "Email validado. Voce ja pode acessar o ALL Assist.";
    setTimeout(() => {
      window.location.href = "/login.html";
    }, 1200);
  } catch {
    message.textContent = "Nao foi possivel validar o email agora.";
    button.disabled = false;
  }
}
