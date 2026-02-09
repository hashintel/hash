function submitConsentForm(submitValue) {
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
  var buttons = form.querySelectorAll('button[type="submit"]');
  buttons.forEach(function (button) {
    button.addEventListener("click", function (event) {
      event.preventDefault();
      submitConsentForm(button.value);
    });
  });
}

if (document.readyState !== "loading") {
  attachFormHandler();
} else {
  document.addEventListener("DOMContentLoaded", attachFormHandler);
}
