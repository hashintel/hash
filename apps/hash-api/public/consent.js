function submitConsentForm() {
  var submitButton = document.querySelector('button[type="submit"]');
  var submitValue = submitButton.value;
  var grantScope = document.querySelectorAll(
    'input[name="grant_scope"]:checked',
  );
  var grantScopeValues = [];
  for (var i = 0; i < grantScope.length; i++) {
    grantScopeValues.push(grantScope[i].value);
  }

  var challenge = document.querySelector('input[name="challenge"]').value;
  var data = {
    grant_scope: grantScopeValues,
    submit: submitValue,
    challenge: challenge,
  };
  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/oauth2/consent");
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.onload = function () {
    if (xhr.status === 200) {
      window.location.href = JSON.parse(xhr.responseText).redirectTo;
    } else {
      alert("Something went wrong");
    }
  };
  xhr.send(JSON.stringify(data));
}

function attachFormHandler() {
  var form = document.querySelector("form");
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    submitConsentForm();
  });
}

if (document.readyState !== "loading") {
  attachFormHandler();
} else {
  document.addEventListener("DOMContentLoaded", attachFormHandler);
}
