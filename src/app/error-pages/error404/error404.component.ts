import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-error404',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './error404.component.html',
  styleUrl: '../error-page.scss',
})
export class Error404Component {}
