import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-error500',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './error500.component.html',
  styleUrl: './error500.component.scss',
})
export class Error500Component {}
